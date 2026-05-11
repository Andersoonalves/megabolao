import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { Queue } from 'bullmq';
import { validarPalpites } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ImportCotasDto } from './dto/import-cotas.dto';
import { ExportarResultadosDto } from './dto/exportar-resultados.dto';
import { VincularSheetsDto } from './dto/vincular-sheets.dto';
import { SHEETS_SYNC_QUEUE, SheetsSyncTrigger } from './jobs/sheets-sync.types';

export interface ImportResult {
  total: number;
  criadas: number;
  erros: { linha: number; erro: string }[];
}

export interface PreviewRow {
  linha: number;
  nome: string;
  celular: string | null;
  palpites: number[];
  valida: boolean;
  erro: string | null;
}

export interface PreviewResult {
  total: number;
  validas: number;
  invalidas: number;
  preview: PreviewRow[];
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenantService: TenantService,
    @Optional() @Inject(SHEETS_SYNC_QUEUE) private readonly syncQueue?: Queue,
  ) {}

  async importarCotas(
    tenantId: string | null,
    bolaoId: string,
    dto: ImportCotasDto,
  ): Promise<ImportResult> {
    this.assertTenantId(tenantId);
    await this.tenantService.assertTenantPermiteCadastros(tenantId!);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) {
      throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });
    }
    if (bolao.status === 'FINALIZADO') {
      throw new BusinessException('BOLAO_FINALIZADO', 'Não é possível importar cotas para bolão FINALIZADO');
    }

    const range = dto.range ?? 'Plan1!A2:L1000';
    const sheets = google.sheets({ version: 'v4', auth: this.getAuth() });

    let rows: (string | number | boolean | null)[][];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: dto.spreadsheetId,
        range,
      });
      rows = (response.data.values as typeof rows) ?? [];
    } catch {
      throw new BusinessException(
        'SHEETS_INACESSIVEL',
        'Não foi possível acessar a planilha. Verifique o ID e as permissões da Service Account.',
      );
    }

    const criadasIds: string[] = [];
    const erros: { linha: number; erro: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linha = i + 2;

      try {
        const nome = String(row[0] ?? '').trim();
        if (!nome) continue;

        const celularRaw = row[1] ? String(row[1]).replace(/\D/g, '') : undefined;
        const celular = celularRaw && celularRaw.length >= 10 ? celularRaw : undefined;
        const palpites = Array.from({ length: 10 }, (_, k) => parseInt(String(row[k + 2] ?? ''), 10));

        if (!validarPalpites(palpites)) {
          throw new Error(`Palpites inválidos: ${palpites.join(', ')} (devem ser 10 números únicos entre 1 e 60)`);
        }

        const cota = await this.prisma.$transaction(async (tx) => {
          const { _max } = await tx.cota.aggregate({
            where: { bolaoId, tenantId: tenantId! },
            _max: { numeroSequencial: true },
          });
          return tx.cota.create({
            data: {
              tenantId: tenantId!,
              bolaoId,
              nomeIdentificacao: nome,
              numeroCelular: celular ?? null,
              numeroSequencial: (_max.numeroSequencial ?? 0) + 1,
              palpites,
            },
          });
        });

        criadasIds.push(cota.id);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Linha ${linha}: ${errMsg}`);
        erros.push({ linha, erro: errMsg });
        if (!dto.ignorarErros) break;
      }
    }

    this.logger.log(`Import: ${criadasIds.length} cotas criadas, ${erros.length} erros`);
    return { total: rows.length, criadas: criadasIds.length, erros };
  }

  async exportarResultados(
    tenantId: string | null,
    bolaoId: string,
    dto: ExportarResultadosDto,
  ): Promise<void> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) {
      throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });
    }

    const cotas = await this.prisma.cota.findMany({
      where: { bolaoId, tenantId: tenantId!, statusPagamento: 'PAGO' },
      orderBy: [{ totalAcertosAcumulados: 'desc' }, { numeroSequencial: 'asc' }],
    });

    const aba = dto.aba ?? 'Ranking';
    const headers = [['Posição', 'Nº Cota', 'Nome', 'Celular', 'Acertos']];
    const linhas = cotas.map((c, idx) => [
      idx + 1,
      c.numeroSequencial,
      c.nomeIdentificacao,
      c.numeroCelular ?? '',
      c.totalAcertosAcumulados,
    ]);
    const values = [...headers, ...linhas];

    const sheets = google.sheets({ version: 'v4', auth: this.getAuth() });

    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: dto.spreadsheetId,
        range: `${aba}!A1:Z10000`,
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: dto.spreadsheetId,
        range: `${aba}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    } catch {
      throw new BusinessException(
        'SHEETS_ESCRITA_FALHOU',
        'Não foi possível escrever na planilha. Verifique as permissões de edição da Service Account.',
      );
    }

    this.logger.log(`Export: ${cotas.length} cotas exportadas para ${dto.spreadsheetId}`);
  }

  async getSheetsStatus(tenantId: string | null, bolaoId: string) {
    this.assertTenantId(tenantId);
    const bolao = await this.prisma.bolao.findFirst({
      where: { id: bolaoId, tenantId },
      select: { sheetsSpreadsheetId: true, sheetsAtivo: true, sheetsUltimaSyncAt: true, sheetsUltimoErro: true },
    });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });
    return {
      vinculada:     !!bolao.sheetsSpreadsheetId,
      spreadsheetId: bolao.sheetsSpreadsheetId ?? null,
      ativo:         bolao.sheetsAtivo,
      ultimaSyncAt:  bolao.sheetsUltimaSyncAt?.toISOString() ?? null,
      ultimoErro:    bolao.sheetsUltimoErro ?? null,
    };
  }

  async vincular(tenantId: string | null, bolaoId: string, dto: VincularSheetsDto) {
    this.assertTenantId(tenantId);
    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    await this.prisma.bolao.update({
      where: { id: bolaoId },
      data: { sheetsSpreadsheetId: dto.spreadsheetId, sheetsAtivo: true, sheetsUltimoErro: null },
    });

    // Sync inicial imediato
    await this.triggerSync(bolaoId, tenantId, 'MANUAL');

    return this.getSheetsStatus(tenantId, bolaoId);
  }

  async desvincular(tenantId: string | null, bolaoId: string) {
    this.assertTenantId(tenantId);
    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    await this.prisma.bolao.update({
      where: { id: bolaoId },
      data: { sheetsSpreadsheetId: null, sheetsAtivo: false, sheetsUltimaSyncAt: null, sheetsUltimoErro: null },
    });
  }

  async triggerSync(bolaoId: string, tenantId: string, trigger: SheetsSyncTrigger): Promise<void> {
    if (!this.syncQueue) return;
    await this.syncQueue.add(
      `sync-${trigger.toLowerCase()}`,
      { bolaoId, tenantId, trigger },
      { jobId: `${bolaoId}-${trigger}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 50 },
    );
  }

  async previewImport(
    tenantId: string | null,
    bolaoId: string,
    dto: ImportCotasDto,
  ): Promise<PreviewResult> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    const range = dto.range ?? 'Plan1!A2:L1000';
    const sheets = google.sheets({ version: 'v4', auth: this.getAuth() });

    let rows: (string | number | boolean | null)[][];
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: dto.spreadsheetId, range });
      rows = (res.data.values as typeof rows) ?? [];
    } catch {
      throw new BusinessException('SHEETS_INACESSIVEL', 'Não foi possível acessar a planilha. Verifique o ID e as permissões da Service Account.');
    }

    const preview: PreviewRow[] = [];
    let validas = 0;
    let invalidas = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linha = i + 2;
      const nome = String(row[0] ?? '').trim();
      if (!nome) continue;

      const celularRaw = row[1] ? String(row[1]).replace(/\D/g, '') : undefined;
      const celular    = celularRaw && celularRaw.length >= 10 ? celularRaw : null;
      const palpites   = Array.from({ length: 10 }, (_, k) => parseInt(String(row[k + 2] ?? ''), 10));
      const valida     = validarPalpites(palpites);
      const erro       = valida ? null : `Palpites inválidos: ${palpites.join(', ')}`;

      valida ? validas++ : invalidas++;
      preview.push({ linha, nome, celular, palpites, valida, erro });
    }

    return { total: rows.length, validas, invalidas, preview };
  }

  async exportarCompleto(
    tenantId: string | null,
    bolaoId: string,
    dto: ExportarResultadosDto,
  ): Promise<{ abas: string[]; linhasExportadas: number }> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({
      where: { id: bolaoId, tenantId },
      include: { sorteios: { orderBy: { sequenciaNoBolao: 'asc' } }, categoriasPremiacao: { orderBy: { ordem: 'asc' } } },
    });
    if (!bolao) throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });

    const [cotas, totalPendente] = await Promise.all([
      this.prisma.cota.findMany({
        where: { bolaoId, tenantId: tenantId! },
        orderBy: [{ totalAcertosAcumulados: 'desc' }, { numeroSequencial: 'asc' }],
      }),
      this.prisma.cota.count({ where: { bolaoId, tenantId: tenantId!, statusPagamento: 'PENDENTE' } }),
    ]);

    const cotasPagas = cotas.filter(c => c.statusPagamento === 'PAGO');
    const arrecadacao = Number(bolao.valorCota) * cotasPagas.length;

    const abaResumo     = 'Resumo';
    const abaCotas      = 'Cotas';
    const abaSorteios   = 'Sorteios';
    const abaRanking    = 'Ranking';
    const abaCategorias = 'Categorias';

    const valoresResumo = [
      ['Campo', 'Valor'],
      ['Nome do bolão', bolao.nome],
      ['Status', bolao.status],
      ['Valor da cota (R$)', Number(bolao.valorCota)],
      ['Data início', bolao.dataInicio?.toISOString().slice(0, 10) ?? '—'],
      ['Data término', bolao.dataTermino?.toISOString().slice(0, 10) ?? '—'],
      ['Total de cotas pagas', cotasPagas.length],
      ['Total de cotas pendentes', totalPendente],
      ['Total de cotas', cotas.length],
      ['Arrecadação bruta (R$)', arrecadacao],
      ['Sorteios realizados', bolao.sorteios.length],
    ];

    const valoresCotas = [
      ['Nº Cota', 'Nome', 'Celular', 'Status Pgto', 'Acertos', 'Resultado',
        'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'],
      ...cotas.map(c => [
        c.numeroSequencial, c.nomeIdentificacao, c.numeroCelular ?? '',
        c.statusPagamento, c.totalAcertosAcumulados, c.statusResultado,
        ...c.palpites,
      ]),
    ];

    const bolasUnion = [...new Set(bolao.sorteios.flatMap(s => s.bolasSorteadas))].sort((a, b) => a - b);
    const valoresSorteios = [
      ['Nº Concurso', 'Data', 'Sequência', 'Bola 1', 'Bola 2', 'Bola 3', 'Bola 4', 'Bola 5', 'Bola 6'],
      ...bolao.sorteios.map(s => [
        s.numeroConcurso,
        s.dataSorteio.toISOString().slice(0, 10),
        s.sequenciaNoBolao,
        ...s.bolasSorteadas,
      ]),
      [],
      ['Todas as bolas já sorteadas (union)', bolasUnion.join(', ')],
    ];

    const valoresRanking = [
      ['Posição', 'Nº Cota', 'Nome', 'Celular', 'Acertos', 'Status Resultado'],
      ...cotasPagas.map((c, i) => [
        i + 1, c.numeroSequencial, c.nomeIdentificacao,
        c.numeroCelular ?? '', c.totalAcertosAcumulados, c.statusResultado,
      ]),
    ];

    const valoresCategorias = [
      ['Nome', 'Tipo', 'Acertos Alvo', 'Sorteio Ref.', 'Percentual (%)', 'Acumula sem ganhador'],
      ...bolao.categoriasPremiacao.map(cat => [
        cat.nome, cat.tipo, cat.acertosAlvo ?? '—', cat.sorteioReferencia ?? '—',
        Number(cat.percentual), cat.acumulaSemGanhador ? 'Sim' : 'Não',
      ]),
    ];

    const sheets = google.sheets({ version: 'v4', auth: this.getAuth() });

    try {
      // Garante que todas as abas existem
      const meta = await sheets.spreadsheets.get({ spreadsheetId: dto.spreadsheetId });
      const abasExistentes = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '');
      const abasNecessarias = [abaResumo, abaCotas, abaSorteios, abaRanking, abaCategorias];
      const abasFaltando   = abasNecessarias.filter(a => !abasExistentes.includes(a));

      if (abasFaltando.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: dto.spreadsheetId,
          requestBody: {
            requests: abasFaltando.map(title => ({ addSheet: { properties: { title } } })),
          },
        });
      }

      const dados: { aba: string; valores: (string | number | boolean | null)[][] }[] = [
        { aba: abaResumo,     valores: valoresResumo },
        { aba: abaCotas,      valores: valoresCotas },
        { aba: abaSorteios,   valores: valoresSorteios },
        { aba: abaRanking,    valores: valoresRanking },
        { aba: abaCategorias, valores: valoresCategorias },
      ];

      for (const { aba, valores } of dados) {
        await sheets.spreadsheets.values.clear({ spreadsheetId: dto.spreadsheetId, range: `${aba}!A1:Z10000` });
        await sheets.spreadsheets.values.update({
          spreadsheetId: dto.spreadsheetId,
          range: `${aba}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: valores },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SHEETS_')) throw err;
      throw new BusinessException('SHEETS_ESCRITA_FALHOU', `Não foi possível escrever na planilha: ${msg}`);
    }

    this.logger.log(`Export completo: ${cotas.length} cotas, ${bolao.sorteios.length} sorteios → ${dto.spreadsheetId}`);
    return { abas: [abaResumo, abaCotas, abaSorteios, abaRanking, abaCategorias], linhasExportadas: cotas.length };
  }

  /**
   * Resolve credenciais da Service Account em duas estratégias (nessa ordem):
   *   1) GOOGLE_SA_KEY_PATH → caminho de arquivo JSON exportado do GCP.
   *   2) GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (legado) → mantido para
   *      ambientes sem filesystem persistente (Fly.io secrets, etc.).
   *
   * Preferimos (1) porque parsers de `.env` (Supabase CLI, Doppler, etc.) tendem
   * a engasgar com vírgulas/aspas dentro da chave PEM.
   */
  private getAuth(): JWT {
    const keyPath = this.config.get<string>('GOOGLE_SA_KEY_PATH');
    if (keyPath) return this.authFromFile(keyPath);
    return this.authFromEnv();
  }

  private authFromFile(keyPath: string): JWT {
    const abs = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`GOOGLE_SA_KEY_PATH aponta para arquivo inexistente: ${abs}`);
    }
    let json: { client_email?: string; private_key?: string };
    try {
      json = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      throw new Error(`GOOGLE_SA_KEY_PATH não é JSON válido (${abs}): ${(err as Error).message}`);
    }
    const email = json.client_email;
    const key = json.private_key;
    if (!email || !key || !key.includes('BEGIN')) {
      throw new Error(`GOOGLE_SA_KEY_PATH inválido — esperado client_email + private_key (${abs})`);
    }
    return new JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  private authFromEnv(): JWT {
    const email = this.config.getOrThrow<string>('GOOGLE_SA_EMAIL');
    const rawKey = this.config.getOrThrow<string>('GOOGLE_SA_PRIVATE_KEY');

    // Normaliza a chave independente do formato do .env:
    // 1) Remove aspas externas se existirem
    // 2) Converte \n literal em quebra de linha real
    // 3) Remove espaços em excesso ao redor
    const key = rawKey
      .replace(/^["']|["']$/g, '')  // remove aspas externas
      .replace(/\\n/g, '\n')        // \n literal → quebra real
      .trim();

    if (!key.includes('BEGIN')) {
      throw new Error('GOOGLE_SA_PRIVATE_KEY inválida — verifique o formato no .env');
    }

    // JWT é mais robusto que GoogleAuth com credentials para Node 18+ / OpenSSL 3
    return new JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }
}
