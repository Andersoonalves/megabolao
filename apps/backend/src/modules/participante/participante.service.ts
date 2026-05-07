import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cota, Prisma } from '@prisma/client';
import { PaginatedResponse } from '@nossobolao/shared-types';
import { validarPalpites } from '@nossobolao/shared-utils';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateCotaDto } from './dto/create-cota.dto';
import { UpdateCotaDto } from './dto/update-cota.dto';
import { ListCotasDto } from './dto/list-cotas.dto';

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
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string | null, bolaoId: string, dto: CreateCotaDto): Promise<CotaResponse> {
    this.assertTenantId(tenantId);
    const bolao = await this.findBolaoOrFail(tenantId, bolaoId);

    if (bolao.status === 'FINALIZADO') {
      throw new BusinessException('BOLAO_FINALIZADO', 'Não é possível adicionar cotas a um bolão finalizado');
    }

    this.assertPalpitesValidos(dto.palpites);

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
          nomeIdentificacao: dto.nomeIdentificacao,
          numeroCelular: dto.numeroCelular ?? null,
          numeroSequencial: nextSeq,
          palpites: dto.palpites,
        },
      });
    });

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
      this.assertPalpitesValidos(dto.palpites);
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

    return this.toResponse(updated);
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

  private assertPalpitesValidos(palpites: number[]): void {
    if (!validarPalpites(palpites)) {
      throw new BusinessException(
        'PALPITES_INVALIDOS',
        'Palpites devem conter 10 números únicos entre 1 e 60',
        [{ field: 'palpites', code: 'PALPITES_INVALIDOS', message: '10 números únicos, 1–60' }],
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
