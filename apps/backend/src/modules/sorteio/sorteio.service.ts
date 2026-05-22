import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { validarBolasSorteadas } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateSorteioDto } from './dto/create-sorteio.dto';
import type {
  MegaSenaCaixaMetaDto,
  MegaSenaPainelItemDto,
  MegaSenaPainelResponseDto,
  MegaSenaResultadoCaixaDto,
} from './dto/mega-sena-painel.dto';
import { CALC_ACERTOS_QUEUE, CALC_ACERTOS_QUEUE_NAME, CalcAcertosJobData } from './jobs/calc-acertos.types';
import { SHEETS_SYNC_QUEUE } from '../google-drive/jobs/sheets-sync.types';

/**
 * A API `servicebus2.caixa.gov.br` costuma responder 403 sem cabeçalhos típicos de navegador (WAF).
 * @see https://github.com/BrasilAPI/BrasilAPI/issues/375
 */
const CAIXA_LOTERIAS_FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: 'https://loterias.caixa.gov.br/',
  Origin: 'https://loterias.caixa.gov.br',
};

export interface SorteioResponse {
  id: string;
  tenantId: string;
  bolaoId: string;
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  sequenciaNoBolao: number;
  ehPrimeiro: boolean;
  processado: boolean;
  criadoEm: string;
}

@Injectable()
export class SorteioService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CALC_ACERTOS_QUEUE) private readonly queue: Queue,
    @Optional() @Inject(SHEETS_SYNC_QUEUE) private readonly syncQueue?: Queue,
  ) {}

  async create(tenantId: string | null, bolaoId: string, dto: CreateSorteioDto): Promise<SorteioResponse> {
    this.assertTenantId(tenantId);

    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) {
      throw new NotFoundException({ statusCode: 404, error: 'BOLAO_NAO_ENCONTRADO', message: `Bolão ${bolaoId} não encontrado`, details: [] });
    }

    if (bolao.status !== 'EM_ANDAMENTO') {
      throw new BusinessException(
        'BOLAO_NAO_EM_ANDAMENTO',
        `Sorteios só podem ser registrados em bolões EM_ANDAMENTO. Status: ${bolao.status}`,
      );
    }

    if (!validarBolasSorteadas(dto.bolasSorteadas)) {
      throw new BusinessException(
        'BOLAS_INVALIDAS',
        'bolasSorteadas deve conter 6 números únicos entre 1 e 60',
        [{ field: 'bolasSorteadas', code: 'BOLAS_INVALIDAS', message: '6 únicos, 1–60' }],
      );
    }

    const sorteio = await this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.sorteio.aggregate({
        where: { bolaoId, tenantId },
        _max: { sequenciaNoBolao: true },
      });
      const nextSeq = (_max.sequenciaNoBolao ?? 0) + 1;

      return tx.sorteio.create({
        data: {
          tenantId,
          bolaoId,
          numeroConcurso: dto.numeroConcurso,
          dataSorteio: new Date(dto.dataSorteio),
          bolasSorteadas: dto.bolasSorteadas,
          sequenciaNoBolao: nextSeq,
          ehPrimeiro: nextSeq === 1,
        },
      });
    }).catch((err: { code?: string }) => {
      if (err.code === 'P2002') {
        throw new BusinessException(
          'CONCURSO_DUPLICADO',
          `Concurso ${dto.numeroConcurso} já registrado neste bolão`,
          [{ field: 'numeroConcurso', code: 'CONCURSO_DUPLICADO', message: 'Número de concurso já existe' }],
        );
      }
      throw err;
    });

    await this.queue.add(
      CALC_ACERTOS_QUEUE_NAME,
      { sorteioId: sorteio.id, tenantId, bolaoId } satisfies CalcAcertosJobData,
      {
        jobId: sorteio.id, // deduplicação: mesmo sorteio não gera jobs duplicados
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 60 * 60 * 24 }, // 24h
        removeOnFail: { age: 60 * 60 * 24 * 7 }, // 7d
      },
    );

    this.triggerSheetsSync(bolaoId, tenantId, 'SORTEIO');
    return this.toResponse(sorteio);
  }

  async registrarGlobal(tenantId: string | null, dto: CreateSorteioDto): Promise<{ bolaoesProcessados: number; sorteios: SorteioResponse[] }> {
    this.assertTenantId(tenantId);

    if (!validarBolasSorteadas(dto.bolasSorteadas)) {
      throw new BusinessException(
        'BOLAS_INVALIDAS',
        'bolasSorteadas deve conter 6 números únicos entre 1 e 60',
        [{ field: 'bolasSorteadas', code: 'BOLAS_INVALIDAS', message: '6 únicos, 1–60' }],
      );
    }

    const boloes = await this.prisma.bolao.findMany({
      where: { tenantId, status: 'EM_ANDAMENTO' },
    });

    if (boloes.length === 0) {
      throw new BusinessException(
        'SEM_BOLOES_ATIVOS',
        'Nenhum bolão EM_ANDAMENTO encontrado. Inicie um bolão antes de registrar sorteios.',
        [],
      );
    }

    const sorteios: SorteioResponse[] = [];

    for (const bolao of boloes) {
      const sorteio = await this.prisma.$transaction(async (tx) => {
        const { _max } = await tx.sorteio.aggregate({
          where: { bolaoId: bolao.id, tenantId },
          _max: { sequenciaNoBolao: true },
        });
        const nextSeq = (_max.sequenciaNoBolao ?? 0) + 1;

        return tx.sorteio.create({
          data: {
            tenantId,
            bolaoId: bolao.id,
            numeroConcurso: dto.numeroConcurso,
            dataSorteio: new Date(dto.dataSorteio),
            bolasSorteadas: dto.bolasSorteadas,
            sequenciaNoBolao: nextSeq,
            ehPrimeiro: nextSeq === 1,
          },
        });
      }).catch((err: { code?: string }) => {
        if (err.code === 'P2002') {
          throw new BusinessException(
            'CONCURSO_DUPLICADO',
            `Concurso ${dto.numeroConcurso} já registrado no bolão "${bolao.nome}"`,
            [{ field: 'numeroConcurso', code: 'CONCURSO_DUPLICADO', message: 'Concurso já registrado' }],
          );
        }
        throw err;
      });

      await this.queue.add(
        CALC_ACERTOS_QUEUE_NAME,
        { sorteioId: sorteio.id, tenantId, bolaoId: bolao.id } satisfies CalcAcertosJobData,
        {
          jobId: sorteio.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 60 * 60 * 24 },
          removeOnFail: { age: 60 * 60 * 24 * 7 },
        },
      );

      sorteios.push(this.toResponse(sorteio));
    }

    return { bolaoesProcessados: boloes.length, sorteios };
  }

  async findRecentes(tenantId: string | null, limit = 10): Promise<SorteioResponse[]> {
    this.assertTenantId(tenantId);

    const sorteios = await this.prisma.sorteio.findMany({
      where: { tenantId },
      distinct: ['numeroConcurso'],
      orderBy: { numeroConcurso: 'desc' },
      take: limit,
    });

    return sorteios.map((s) => this.toResponse(s));
  }

  async findAll(tenantId: string | null, bolaoId: string): Promise<SorteioResponse[]> {
    this.assertTenantId(tenantId);

    const sorteios = await this.prisma.sorteio.findMany({
      where: { bolaoId, tenantId },
      orderBy: { sequenciaNoBolao: 'asc' },
    });

    return sorteios.map((s) => this.toResponse(s));
  }

  async findById(tenantId: string | null, bolaoId: string, id: string): Promise<SorteioResponse> {
    this.assertTenantId(tenantId);
    return this.toResponse(await this.findOrFail(tenantId, bolaoId, id));
  }

  async reprocessar(tenantId: string | null, bolaoId: string, id: string): Promise<SorteioResponse> {
    this.assertTenantId(tenantId);
    const sorteio = await this.findOrFail(tenantId, bolaoId, id);

    await this.prisma.sorteio.update({
      where: { id },
      data: { processado: false },
    });

    // JobId único para reprocessamento — permite re-enfileirar
    await this.queue.add(
      CALC_ACERTOS_QUEUE_NAME,
      { sorteioId: id, tenantId, bolaoId } satisfies CalcAcertosJobData,
      {
        jobId: `retry-${id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return this.toResponse({ ...sorteio, processado: false });
  }

  private async findOrFail(tenantId: string, bolaoId: string, id: string) {
    const sorteio = await this.prisma.sorteio.findFirst({ where: { id, bolaoId, tenantId } });
    if (!sorteio) {
      throw new NotFoundException({ statusCode: 404, error: 'SORTEIO_NAO_ENCONTRADO', message: `Sorteio ${id} não encontrado`, details: [] });
    }
    return sorteio;
  }

  async buscarMegaSena(numeroConcurso?: number, ultimos?: number): Promise<
    MegaSenaResultadoCaixaDto | MegaSenaResultadoCaixaDto[]
  > {
    // Para busca de "últimos N" sem concurso específico, tenta o cache local primeiro
    if (!numeroConcurso && ultimos && ultimos > 1) {
      const qtd = Math.min(ultimos, 20);
      const cached = await this.prisma.megaResultado.findMany({
        orderBy: { numeroConcurso: 'desc' },
        take: qtd,
        select: { numeroConcurso: true, dataSorteio: true, bolasSorteadas: true },
      });

      if (cached.length > 0) {
        return cached.map((c) => ({
          numeroConcurso: c.numeroConcurso,
          dataSorteio: c.dataSorteio.toISOString().split('T')[0],
          bolasSorteadas: c.bolasSorteadas,
        }));
      }
      // Cache vazio: fallback para API Caixa abaixo
    }

    const ultimo = await this.fetchCaixa(numeroConcurso);

    if (!ultimos || ultimos <= 1) return ultimo;

    const qtd = Math.min(ultimos, 20);
    const concursos = Array.from({ length: qtd - 1 }, (_, i) => ultimo.numeroConcurso - 1 - i);
    const anteriores = await Promise.all(concursos.map(n => this.fetchCaixa(n).catch(() => null)));

    return [ultimo, ...anteriores.filter((r): r is NonNullable<typeof r> => r !== null)];
  }

  /** Busca resultado(s) completos da Caixa incluindo metadados. Usado pelo checker para popular cache. */
  async buscarMegaSenaComMeta(
    numeroConcurso?: number,
    ultimos = 1,
  ): Promise<(MegaSenaResultadoCaixaDto & MegaSenaCaixaMetaDto)[]> {
    const ultimo = await this.fetchCaixaCompleto(numeroConcurso);
    if (ultimos <= 1) return [ultimo];

    const qtd = Math.min(ultimos, 20);
    const concursos = Array.from({ length: qtd - 1 }, (_, i) => ultimo.numeroConcurso - 1 - i);
    const anteriores = await Promise.all(concursos.map(n => this.fetchCaixaCompleto(n).catch(() => null)));
    return [ultimo, ...anteriores.filter((r): r is NonNullable<typeof r> => r !== null)];
  }

  /**
   * Painel admin: lê do cache local (megaResultado) — zero chamadas à API da Caixa por request.
   * O cache é populado/atualizado pelo CheckMegaSenaProcessor nas janelas de sorteio.
   */
  async buscarMegaSenaPainel(tenantId: string | null, ultimos = 10): Promise<MegaSenaPainelResponseDto> {
    const consultadoEm = new Date().toISOString();
    const qtd = Math.min(Math.max(ultimos, 1), 10);

    const cached = await this.prisma.megaResultado.findMany({
      orderBy: { numeroConcurso: 'desc' },
      take: qtd,
    });

    // Cache vazio: fallback único para popular (não bloqueia, só log)
    if (cached.length === 0) {
      return this.buscarMegaSenaPainelFallback(tenantId, consultadoEm);
    }

    const numeros = cached.map((c) => c.numeroConcurso);
    const aplicMap = tenantId
      ? await this.buscarAplicacoesPorConcurso(tenantId, numeros)
      : new Map<number, MegaSenaPainelItemDto['aplicacoes']>();

    const itens: MegaSenaPainelItemDto[] = cached.map((row) => ({
      numeroConcurso: row.numeroConcurso,
      dataSorteio:    row.dataSorteio.toISOString().split('T')[0],
      bolasSorteadas: row.bolasSorteadas,
      ganhadoresSena: row.ganhadores,
      acumulado:      row.acumulado,
      valorArrecadado: row.valorArrecadado ?? null,
      estimativaProximoConcurso: row.estimativaProximo ?? null,
      dataProximoConcurso: row.dataProximoConcurso ?? null,
      numeroConcursoProximo: row.numeroConcursoProximo ?? null,
      aplicacoes: aplicMap.get(row.numeroConcurso) ?? [],
    }));

    let aplicadosNoPeriodo = 0;
    for (const it of itens) {
      if (it.aplicacoes.length > 0) aplicadosNoPeriodo += 1;
    }

    let bolaoAtivoNome: string | null = null;
    if (tenantId) {
      const b = await this.prisma.bolao.findFirst({
        where: { tenantId, status: 'EM_ANDAMENTO' },
        orderBy: { nome: 'asc' },
        select: { nome: true },
      });
      bolaoAtivoNome = b?.nome ?? null;
    }

    const latest = cached[0];
    return {
      consultadoEm,
      bolaoAtivoNome,
      resumo: { aplicadosNoPeriodo, totalNoPeriodo: itens.length },
      proximo: {
        numero: latest.numeroConcursoProximo ?? null,
        data:   latest.dataProximoConcurso ?? null,
      },
      itens,
    };
  }

  /** Fallback para primeira carga quando cache está vazio: 1 request à Caixa. */
  private async buscarMegaSenaPainelFallback(
    tenantId: string | null,
    consultadoEm: string,
  ): Promise<MegaSenaPainelResponseDto> {
    const ultimo = await this.fetchCaixaCompleto(undefined);
    const aplicMap = tenantId
      ? await this.buscarAplicacoesPorConcurso(tenantId, [ultimo.numeroConcurso])
      : new Map<number, MegaSenaPainelItemDto['aplicacoes']>();

    const item: MegaSenaPainelItemDto = {
      numeroConcurso: ultimo.numeroConcurso,
      dataSorteio:    ultimo.dataSorteio,
      bolasSorteadas: ultimo.bolasSorteadas,
      ganhadoresSena: ultimo.ganhadoresSena,
      acumulado:      ultimo.acumulado,
      valorArrecadado: ultimo.valorArrecadado,
      estimativaProximoConcurso: ultimo.estimativaProximoConcurso,
      dataProximoConcurso: ultimo.dataProximoConcurso,
      numeroConcursoProximo: ultimo.numeroConcursoProximo,
      aplicacoes: aplicMap.get(ultimo.numeroConcurso) ?? [],
    };

    let bolaoAtivoNome: string | null = null;
    if (tenantId) {
      const b = await this.prisma.bolao.findFirst({
        where: { tenantId, status: 'EM_ANDAMENTO' },
        orderBy: { nome: 'asc' },
        select: { nome: true },
      });
      bolaoAtivoNome = b?.nome ?? null;
    }

    return {
      consultadoEm,
      bolaoAtivoNome,
      resumo: { aplicadosNoPeriodo: item.aplicacoes.length > 0 ? 1 : 0, totalNoPeriodo: 1 },
      proximo: { numero: ultimo.numeroConcursoProximo, data: ultimo.dataProximoConcurso },
      itens: [item],
    };
  }

  private async buscarAplicacoesPorConcurso(
    tenantId: string,
    numeros: number[],
  ): Promise<Map<number, MegaSenaPainelItemDto['aplicacoes']>> {
    const map = new Map<number, MegaSenaPainelItemDto['aplicacoes']>();
    if (numeros.length === 0) return map;

    const rows = await this.prisma.sorteio.findMany({
      where: { tenantId, numeroConcurso: { in: numeros } },
      select: {
        id: true,
        numeroConcurso: true,
        sequenciaNoBolao: true,
        bolao: { select: { id: true, nome: true } },
      },
      orderBy: [{ numeroConcurso: 'desc' }, { bolaoId: 'asc' }],
    });

    for (const r of rows) {
      const list = map.get(r.numeroConcurso) ?? [];
      list.push({
        sorteioId: r.id,
        bolaoId: r.bolao.id,
        bolaoNome: r.bolao.nome,
        sequenciaNoBolao: r.sequenciaNoBolao,
      });
      map.set(r.numeroConcurso, list);
    }
    return map;
  }

  private async fetchCaixa(numeroConcurso?: number): Promise<MegaSenaResultadoCaixaDto> {
    const full = await this.fetchCaixaCompleto(numeroConcurso);
    return {
      numeroConcurso: full.numeroConcurso,
      dataSorteio: full.dataSorteio,
      bolasSorteadas: full.bolasSorteadas,
    };
  }

  private async fetchCaixaCompleto(numeroConcurso?: number): Promise<MegaSenaResultadoCaixaDto & MegaSenaCaixaMetaDto> {
    const url = numeroConcurso
      ? `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${numeroConcurso}`
      : 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena';

    let res: Response;
    try {
      res = await fetch(url, { headers: CAIXA_LOTERIAS_FETCH_HEADERS });
    } catch {
      throw new BusinessException('CAIXA_INDISPONIVEL', 'Não foi possível conectar à API da Caixa');
    }

    if (!res.ok) {
      if (res.status === 403) {
        throw new BusinessException(
          'CAIXA_ACESSO_NEGADO',
          'A API da Caixa retornou 403 (acesso negado). O WAF da Caixa pode bloquear o IP do servidor; em ambiente local costuma funcionar com estes cabeçalhos.',
        );
      }
      throw new BusinessException(
        'CAIXA_RESULTADO_NAO_ENCONTRADO',
        `Concurso não encontrado ou indisponível na Caixa (HTTP ${res.status})`,
      );
    }

    const data = await res.json() as Record<string, unknown>;
    const base = this.normalizarBaseCaixaMega(data);
    const meta = this.parseCaixaMegaMeta(data);
    return { ...base, ...meta };
  }

  private normalizarBaseCaixaMega(data: Record<string, unknown>): MegaSenaResultadoCaixaDto {
    const numero = Number(data.numero);
    const dataApuracao = String(data.dataApuracao ?? '');
    const lista = data.listaDezenas;
    if (!Number.isFinite(numero) || !dataApuracao.includes('/') || !Array.isArray(lista)) {
      throw new BusinessException('CAIXA_RESPOSTA_INVALIDA', 'Resposta inesperada da API da Caixa');
    }
    const [d, m, y] = dataApuracao.split('/');
    return {
      numeroConcurso: numero,
      dataSorteio: `${y}-${m}-${d}`,
      bolasSorteadas: lista.map((x) => Number(String(x))).sort((a, b) => a - b),
    };
  }

  private parseCaixaMegaMeta(data: Record<string, unknown>): MegaSenaCaixaMetaDto {
    const listaRaw = data.listaRateioPremio;
    const lista = Array.isArray(listaRaw) ? listaRaw as Record<string, unknown>[] : [];

    const faixaSena = lista.find((f) => {
      const faixa = Number(f.faixa);
      const desc = String(f.descricaoFaixa ?? '').toLowerCase();
      return faixa === 1 || desc.includes('6 acertos') || desc.includes('sena');
    });

    const ganhadoresSena = typeof faixaSena?.numeroDeGanhadores === 'number'
      ? faixaSena.numeroDeGanhadores
      : 0;

    const acumuladoRaw = data.acumulado;
    const acumulado = acumuladoRaw === true
      || String(acumuladoRaw).toLowerCase() === 'sim'
      || String(acumuladoRaw).toLowerCase() === 'true';

    const toNum = (v: unknown): number | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const t = v.trim();
        if (!t) return null;
        const normalized = t.includes(',') && t.includes('.')
          ? t.replace(/\./g, '').replace(',', '.')
          : t.replace(',', '.');
        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    return {
      ganhadoresSena,
      acumulado,
      valorArrecadado: toNum(data.valorArrecadado),
      estimativaProximoConcurso: toNum(
        data.valorEstimadoProximoConcurso ?? data.valorAcumuladoProximoConcurso,
      ),
      dataProximoConcurso: typeof data.dataProximoConcurso === 'string' ? data.dataProximoConcurso : null,
      numeroConcursoProximo: toNum(data.numeroConcursoProximo),
    };
  }

  // ── Notificação / Auto-apply Mega-Sena ────────────────────────────────────

  async verificarPendente(tenantId: string | null): Promise<{
    hasPendente: boolean;
    resultado: { numeroConcurso: number; dataSorteio: string; bolasSorteadas: number[] } | null;
    autoApply: boolean;
  }> {
    this.assertTenantId(tenantId);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const ultimoGlobal = await this.prisma.megaResultado.findFirst({
      orderBy: { numeroConcurso: 'desc' },
    });

    if (!ultimoGlobal) return { hasPendente: false, resultado: null, autoApply: tenant.sorteioAutoApply };

    // Já foi dispensado pelo tenant
    if (tenant.sorteioUltimoIgnorado !== null && tenant.sorteioUltimoIgnorado >= ultimoGlobal.numeroConcurso) {
      return { hasPendente: false, resultado: null, autoApply: tenant.sorteioAutoApply };
    }

    // Já foi aplicado neste tenant
    const jaAplicado = await this.prisma.sorteio.findFirst({
      where: { tenantId, numeroConcurso: ultimoGlobal.numeroConcurso },
    });

    if (jaAplicado) return { hasPendente: false, resultado: null, autoApply: tenant.sorteioAutoApply };

    return {
      hasPendente: true,
      resultado: {
        numeroConcurso: ultimoGlobal.numeroConcurso,
        dataSorteio:    ultimoGlobal.dataSorteio.toISOString().split('T')[0],
        bolasSorteadas: ultimoGlobal.bolasSorteadas,
      },
      autoApply: tenant.sorteioAutoApply,
    };
  }

  async aplicarPendente(tenantId: string | null) {
    this.assertTenantId(tenantId);
    const { hasPendente, resultado } = await this.verificarPendente(tenantId);
    if (!hasPendente || !resultado) {
      throw new BusinessException('NENHUM_PENDENTE', 'Não há resultado pendente para aplicar');
    }
    return this.registrarGlobal(tenantId, resultado);
  }

  async ignorarPendente(tenantId: string | null): Promise<{ ok: true }> {
    this.assertTenantId(tenantId);
    const { resultado } = await this.verificarPendente(tenantId);
    if (!resultado) throw new BusinessException('NENHUM_PENDENTE', 'Não há resultado pendente para ignorar');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { sorteioUltimoIgnorado: resultado.numeroConcurso },
    });
    return { ok: true };
  }

  async configurarAutoApply(tenantId: string | null, autoApply: boolean): Promise<{ autoApply: boolean }> {
    this.assertTenantId(tenantId);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { sorteioAutoApply: autoApply },
    });
    return { autoApply };
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }

  private triggerSheetsSync(bolaoId: string, tenantId: string, trigger: 'SORTEIO' | 'RANKING'): void {
    if (!this.syncQueue) return;
    this.syncQueue.add(`sync-${trigger.toLowerCase()}`, { bolaoId, tenantId, trigger }, {
      jobId: `${bolaoId}-${trigger}-${Date.now()}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    }).catch(() => {});
  }

  private toResponse(s: {
    id: string; tenantId: string; bolaoId: string; numeroConcurso: number;
    dataSorteio: Date; bolasSorteadas: number[]; sequenciaNoBolao: number;
    ehPrimeiro: boolean; processado: boolean; criadoEm: Date;
  }): SorteioResponse {
    return {
      id: s.id,
      tenantId: s.tenantId,
      bolaoId: s.bolaoId,
      numeroConcurso: s.numeroConcurso,
      dataSorteio: s.dataSorteio.toISOString().split('T')[0],
      bolasSorteadas: s.bolasSorteadas,
      sequenciaNoBolao: s.sequenciaNoBolao,
      ehPrimeiro: s.ehPrimeiro,
      processado: s.processado,
      criadoEm: s.criadoEm.toISOString(),
    };
  }
}
