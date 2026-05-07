import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { validarPalpites } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ImportCotasDto } from './dto/import-cotas.dto';
import { ExportarResultadosDto } from './dto/exportar-resultados.dto';

export interface ImportResult {
  total: number;
  criadas: number;
  erros: { linha: number; erro: string }[];
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async importarCotas(
    tenantId: string | null,
    bolaoId: string,
    dto: ImportCotasDto,
  ): Promise<ImportResult> {
    this.assertTenantId(tenantId);

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

  private getAuth() {
    const email = this.config.getOrThrow<string>('GOOGLE_SA_EMAIL');
    const key = this.config.getOrThrow<string>('GOOGLE_SA_PRIVATE_KEY').replace(/\\n/g, '\n');
    return new google.auth.GoogleAuth({
      credentials: { type: 'service_account', client_email: email, private_key: key },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }
}
