import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Cota, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PaginatedResponse } from '@nossobolao/shared-types';
import { validarPalpites } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { BancoParticipanteService } from './banco-participante.service';
import { SHEETS_SYNC_QUEUE } from '../google-drive/jobs/sheets-sync.types';
import { CreateCotaDto } from './dto/create-cota.dto';
import { UpdateCotaDto } from './dto/update-cota.dto';
import { ListCotasDto } from './dto/list-cotas.dto';

export interface ImportCSVResult {
  total:   number;
  criadas: number;
  erros:   { linha: number; campo: string; erro: string }[];
}

export interface CotaResponse {
  id: string;
  tenantId: string;
  bolaoId: string;
  nomeIdentificacao: string;
  numeroCelular: string | null;
  numeroSequencial: number;
  palpites: number[];
  statusPagamento: string;
  dataConfirmacaoPagamento: string | null;
  totalAcertosAcumulados: number;
  statusResultado: string;
  criadoEm: string;
  atualizadoEm: string;
}

@Injectable()
export class ParticipanteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bancoParticipante: BancoParticipanteService,
    private readonly tenantService: TenantService,
    @Optional() @Inject(SHEETS_SYNC_QUEUE) private readonly syncQueue?: Queue,
  ) {}

  async create(tenantId: string | null, bolaoId: string, dto: CreateCotaDto): Promise<CotaResponse> {
    this.assertTenantId(tenantId);
    await this.tenantService.assertTenantPermiteCadastros(tenantId);
    const bolao = await this.findBolaoOrFail(tenantId, bolaoId);

    if (bolao.status === 'FINALIZADO') {
      throw new BusinessException('BOLAO_FINALIZADO', 'Não é possível adicionar cotas a um bolão finalizado');
    }

    this.assertPalpitesValidos(dto.palpites, bolao.qtdNumerosCota);

    // Auto-vincula ou cria participante quando celular for informado
    let participanteId: string | null = null;
    if (dto.numeroCelular) {
      participanteId = await this.bancoParticipante.upsertParaCota(
        tenantId,
        dto.nomeIdentificacao,
        dto.numeroCelular,
      );
    }

    const cota = await this.prisma.$transaction(async (tx) => {
      const { _max } = await tx.cota.aggregate({
        where: { bolaoId, tenantId },
        _max: { numeroSequencial: true },
      });
      const nextSeq = (_max.numeroSequencial ?? 0) + 1;

      return tx.cota.create({
        data: {
          tenantId,
          bolaoId,
          participanteId,
          nomeIdentificacao: dto.nomeIdentificacao,
          numeroCelular: dto.numeroCelular ?? null,
          numeroSequencial: nextSeq,
          palpites: dto.palpites,
        },
      });
    });

    this.triggerSheetsSync(bolaoId, tenantId, 'COTA');
    return this.toResponse(cota);
  }

  async findAll(
    tenantId: string | null,
    bolaoId: string,
    { page = 1, perPage = 50, status, busca }: ListCotasDto,
  ): Promise<PaginatedResponse<CotaResponse>> {
    this.assertTenantId(tenantId);
    await this.findBolaoOrFail(tenantId, bolaoId);

    const where: Prisma.CotaWhereInput = {
      bolaoId,
      tenantId,
      ...(status && { statusPagamento: status as Cota['statusPagamento'] }),
      ...(busca && {
        OR: [
          { nomeIdentificacao: { contains: busca, mode: 'insensitive' } },
          { numeroCelular: { contains: busca } },
        ],
      }),
    };

    const skip = (page - 1) * perPage;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.cota.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { numeroSequencial: 'asc' },
      }),
      this.prisma.cota.count({ where }),
    ]);

    return {
      data: data.map((c) => this.toResponse(c)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findById(tenantId: string | null, bolaoId: string, id: string): Promise<CotaResponse> {
    this.assertTenantId(tenantId);
    return this.toResponse(await this.findCotaOrFail(tenantId, bolaoId, id));
  }

  async update(
    tenantId: string | null,
    bolaoId: string,
    id: string,
    dto: UpdateCotaDto,
  ): Promise<CotaResponse> {
    this.assertTenantId(tenantId);
    const cota = await this.findCotaOrFail(tenantId, bolaoId, id);

    if (cota.statusPagamento !== 'PENDENTE') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        `Apenas cotas PENDENTE podem ser editadas. Status: ${cota.statusPagamento}`,
      );
    }

    if (dto.palpites) {
      const bolao = await this.findBolaoOrFail(tenantId, bolaoId);
      this.assertPalpitesValidos(dto.palpites, bolao.qtdNumerosCota);
    }

    const updated = await this.prisma.cota.update({
      where: { id },
      data: {
        ...(dto.nomeIdentificacao !== undefined && { nomeIdentificacao: dto.nomeIdentificacao }),
        ...(dto.numeroCelular !== undefined && { numeroCelular: dto.numeroCelular }),
        ...(dto.palpites !== undefined && { palpites: dto.palpites }),
      },
    });

    return this.toResponse(updated);
  }

  async confirmarPagamento(tenantId: string | null, bolaoId: string, id: string): Promise<CotaResponse> {
    this.assertTenantId(tenantId);
    const cota = await this.findCotaOrFail(tenantId, bolaoId, id);

    if (cota.statusPagamento !== 'PENDENTE') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        `Apenas cotas PENDENTE podem ser confirmadas. Status atual: ${cota.statusPagamento}`,
      );
    }

    const updated = await this.prisma.cota.update({
      where: { id },
      data: {
        statusPagamento: 'PAGO',
        dataConfirmacaoPagamento: new Date(),
      },
    });

    this.triggerSheetsSync(bolaoId, tenantId, 'COTA');
    return this.toResponse(updated);
  }

  async pagarEmMassa(
    tenantId: string | null,
    bolaoId: string,
    cotaIds: string[],
  ): Promise<{ atualizadas: number }> {
    this.assertTenantId(tenantId);
    await this.findBolaoOrFail(tenantId, bolaoId);

    const result = await this.prisma.cota.updateMany({
      where: {
        id:              { in: cotaIds },
        bolaoId,
        tenantId,
        statusPagamento: 'PENDENTE',
      },
      data: {
        statusPagamento:           'PAGO',
        dataConfirmacaoPagamento:  new Date(),
      },
    });

    if (result.count > 0) this.triggerSheetsSync(bolaoId, tenantId, 'COTA');
    return { atualizadas: result.count };
  }

  async pagarTodasPendentes(
    tenantId: string | null,
    bolaoId: string,
  ): Promise<{ atualizadas: number }> {
    this.assertTenantId(tenantId);
    await this.findBolaoOrFail(tenantId, bolaoId);

    const result = await this.prisma.cota.updateMany({
      where: { bolaoId, tenantId, statusPagamento: 'PENDENTE' },
      data: {
        statusPagamento:          'PAGO',
        dataConfirmacaoPagamento: new Date(),
      },
    });

    if (result.count > 0) this.triggerSheetsSync(bolaoId, tenantId, 'COTA');
    return { atualizadas: result.count };
  }

  async importarCotasCSV(
    tenantId: string | null,
    bolaoId: string,
    fileBuffer: Buffer,
    ignorarErros = true,
  ): Promise<ImportCSVResult> {
    this.assertTenantId(tenantId);
    await this.tenantService.assertTenantPermiteCadastros(tenantId);

    const bolao = await this.findBolaoOrFail(tenantId, bolaoId);
    if (bolao.status === 'FINALIZADO') {
      throw new BusinessException('BOLAO_FINALIZADO', 'Não é possível importar cotas para bolão FINALIZADO');
    }

    const rows = this.parseCSVBuffer(fileBuffer, bolao.qtdNumerosCota);
    const erros: ImportCSVResult['erros'] = [];
    let criadas = 0;

    for (let i = 0; i < rows.length; i++) {
      const { nome, celular, palpites } = rows[i];
      const linha = i + 2; // 1-indexed + header row

      if (!nome) {
        erros.push({ linha, campo: 'nome', erro: 'Nome obrigatório' });
        if (!ignorarErros) break;
        continue;
      }

      if (!validarPalpites(palpites, bolao.qtdNumerosCota)) {
        erros.push({
          linha, campo: 'palpites',
          erro: `${bolao.qtdNumerosCota} números únicos 1-60 obrigatórios (recebido: ${palpites.join(',') || 'vazio'})`,
        });
        if (!ignorarErros) break;
        continue;
      }

      try {
        let participanteId: string | null = null;
        if (celular) {
          participanteId = await this.bancoParticipante.upsertParaCota(tenantId, nome, celular);
        }

        await this.prisma.$transaction(async (tx) => {
          const { _max } = await tx.cota.aggregate({
            where: { bolaoId, tenantId: tenantId! },
            _max: { numeroSequencial: true },
          });
          await tx.cota.create({
            data: {
              tenantId:          tenantId!,
              bolaoId,
              participanteId,
              nomeIdentificacao: nome.toUpperCase(),
              numeroCelular:     celular ?? null,
              numeroSequencial:  (_max.numeroSequencial ?? 0) + 1,
              palpites,
            },
          });
        });

        criadas++;
      } catch (err) {
        erros.push({ linha, campo: 'geral', erro: err instanceof Error ? err.message : String(err) });
        if (!ignorarErros) break;
      }
    }

    if (criadas > 0) this.triggerSheetsSync(bolaoId, tenantId, 'COTA');
    return { total: rows.length, criadas, erros };
  }

  // ── CSV parsing (sem dependência externa) ─────────────────────────────────

  private parseCSVBuffer(buffer: Buffer, qtd = 10): { nome: string; celular?: string; palpites: number[] }[] {
    const text  = buffer.toString('utf-8').replace(/^/, ''); // remove BOM
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const sep = lines[0].includes(';') ? ';' : ',';
    const result: { nome: string; celular?: string; palpites: number[] }[] = [];

    for (const line of lines) {
      const cols = this.splitCSVLine(line, sep);
      const nome = (cols[0] ?? '').trim();
      if (!nome || /^nome$/i.test(nome)) continue; // skip header or empty

      const celularRaw = (cols[1] ?? '').replace(/\D/g, '');
      const celular    = celularRaw.length >= 10 ? celularRaw : undefined;
      const palpites   = cols.slice(2, 2 + qtd).map(c => parseInt(c.trim(), 10)).filter(n => !isNaN(n));

      result.push({ nome, celular, palpites });
    }
    return result;
  }

  private splitCSVLine(line: string, sep: string): string[] {
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  }

  async inativar(tenantId: string | null, bolaoId: string, id: string): Promise<CotaResponse> {
    this.assertTenantId(tenantId);
    const cota = await this.findCotaOrFail(tenantId, bolaoId, id);

    if (cota.statusPagamento === 'INATIVO') {
      throw new BusinessException('STATUS_INVALIDO', 'Cota já está INATIVA');
    }

    const updated = await this.prisma.cota.update({
      where: { id },
      data: { statusPagamento: 'INATIVO' },
    });

    return this.toResponse(updated);
  }

  async delete(tenantId: string | null, bolaoId: string, id: string): Promise<void> {
    this.assertTenantId(tenantId);
    const cota = await this.findCotaOrFail(tenantId, bolaoId, id);

    if (cota.statusPagamento !== 'PENDENTE') {
      throw new BusinessException(
        'STATUS_INVALIDO',
        `Apenas cotas PENDENTE podem ser excluídas. Status: ${cota.statusPagamento}`,
      );
    }

    await this.prisma.cota.delete({ where: { id } });
  }

  // ── Sheets sync ───────────────────────────────────────────────────────────
  private triggerSheetsSync(bolaoId: string, tenantId: string, trigger: 'COTA' | 'SORTEIO' | 'RANKING' | 'MANUAL'): void {
    if (!this.syncQueue) return;
    this.syncQueue.add(`sync-${trigger.toLowerCase()}`, { bolaoId, tenantId, trigger }, {
      jobId: `${bolaoId}-${trigger}-${Date.now()}`,
      removeOnComplete: 100,
      removeOnFail: 50,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    }).catch(() => {}); // fire-and-forget
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async findBolaoOrFail(tenantId: string, bolaoId: string) {
    const bolao = await this.prisma.bolao.findFirst({ where: { id: bolaoId, tenantId } });
    if (!bolao) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'BOLAO_NAO_ENCONTRADO',
        message: `Bolão ${bolaoId} não encontrado`,
        details: [],
      });
    }
    return bolao;
  }

  private async findCotaOrFail(tenantId: string, bolaoId: string, id: string): Promise<Cota> {
    const cota = await this.prisma.cota.findFirst({ where: { id, bolaoId, tenantId } });
    if (!cota) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'COTA_NAO_ENCONTRADA',
        message: `Cota ${id} não encontrada`,
        details: [],
      });
    }
    return cota;
  }

  private assertPalpitesValidos(palpites: number[], qtd: number): void {
    if (!validarPalpites(palpites, qtd)) {
      throw new BusinessException(
        'PALPITES_INVALIDOS',
        `Palpites devem conter ${qtd} números únicos entre 1 e 60`,
        [{ field: 'palpites', code: 'PALPITES_INVALIDOS', message: `${qtd} números únicos, 1–60` }],
      );
    }
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }

  private toResponse(c: Cota): CotaResponse {
    return {
      id: c.id,
      tenantId: c.tenantId,
      bolaoId: c.bolaoId,
      nomeIdentificacao: c.nomeIdentificacao,
      numeroCelular: c.numeroCelular,
      numeroSequencial: c.numeroSequencial,
      palpites: c.palpites,
      statusPagamento: c.statusPagamento,
      dataConfirmacaoPagamento: c.dataConfirmacaoPagamento?.toISOString() ?? null,
      totalAcertosAcumulados: c.totalAcertosAcumulados,
      statusResultado: c.statusResultado,
      criadoEm: c.criadoEm.toISOString(),
      atualizadoEm: c.atualizadoEm.toISOString(),
    };
  }
}
