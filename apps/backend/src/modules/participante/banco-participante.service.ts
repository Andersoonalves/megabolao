import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Participante } from '@prisma/client';
import { PaginatedResponse } from '@nossobolao/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateParticipanteDto } from './dto/create-participante.dto';
import { UpdateParticipanteDto } from './dto/update-participante.dto';
import { ListParticipantesDto } from './dto/list-participantes.dto';

export interface ParticipanteResponse {
  id: string;
  tenantId: string;
  nome: string;
  numeroCelular: string;
  email: string | null;
  observacoes: string | null;
  totalCotas: number;
  boloes: { id: string; nome: string; cotasCount: number }[];
  criadoEm: string;
  atualizadoEm: string;
}

@Injectable()
export class BancoParticipanteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string | null, dto: CreateParticipanteDto): Promise<ParticipanteResponse> {
    this.assertTenantId(tenantId);

    const existente = await this.prisma.participante.findUnique({
      where: { tenantId_numeroCelular: { tenantId, numeroCelular: dto.numeroCelular } },
    });
    if (existente) {
      throw new ConflictException({
        statusCode: 409,
        error: 'CELULAR_JA_CADASTRADO',
        message: `Celular ${dto.numeroCelular} já está cadastrado neste tenant`,
        details: [{ field: 'numeroCelular', code: 'CELULAR_JA_CADASTRADO', message: 'Já existe participante com este celular' }],
      });
    }

    const p = await this.prisma.participante.create({
      data: { tenantId, nome: dto.nome.toUpperCase(), numeroCelular: dto.numeroCelular, email: dto.email ?? null, observacoes: dto.observacoes ?? null },
    });

    return this.toResponse(p, 0, []);
  }

  async findAll(
    tenantId: string | null,
    { page = 1, perPage = 50, busca }: ListParticipantesDto,
  ): Promise<PaginatedResponse<ParticipanteResponse>> {
    this.assertTenantId(tenantId);

    const where = {
      tenantId,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: 'insensitive' as const } },
          { numeroCelular: { contains: busca } },
          { email: { contains: busca, mode: 'insensitive' as const } },
        ],
      }),
    };

    const skip = (page - 1) * perPage;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.participante.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { nome: 'asc' },
        include: { cotas: { select: { bolaoId: true, bolao: { select: { id: true, nome: true } } } } },
      }),
      this.prisma.participante.count({ where }),
    ]);

    return {
      data: data.map((p) => this.toResponseFromInclude(p)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findById(tenantId: string | null, id: string): Promise<ParticipanteResponse> {
    this.assertTenantId(tenantId);
    const p = await this.prisma.participante.findFirst({
      where: { id, tenantId },
      include: { cotas: { select: { bolaoId: true, bolao: { select: { id: true, nome: true } } } } },
    });
    if (!p) throw new NotFoundException({ statusCode: 404, error: 'PARTICIPANTE_NAO_ENCONTRADO', message: `Participante ${id} não encontrado`, details: [] });
    return this.toResponseFromInclude(p);
  }

  async findByCelular(tenantId: string | null, numeroCelular: string): Promise<ParticipanteResponse | null> {
    this.assertTenantId(tenantId);
    const p = await this.prisma.participante.findUnique({
      where: { tenantId_numeroCelular: { tenantId, numeroCelular } },
      include: { cotas: { select: { bolaoId: true, bolao: { select: { id: true, nome: true } } } } },
    });
    return p ? this.toResponseFromInclude(p) : null;
  }

  async update(tenantId: string | null, id: string, dto: UpdateParticipanteDto): Promise<ParticipanteResponse> {
    this.assertTenantId(tenantId);
    const p = await this.findParticipanteOrFail(tenantId, id);

    const updated = await this.prisma.participante.update({
      where: { id: p.id },
      data: {
        ...(dto.nome !== undefined && { nome: dto.nome.toUpperCase() }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.observacoes !== undefined && { observacoes: dto.observacoes }),
      },
      include: { cotas: { select: { bolaoId: true, bolao: { select: { id: true, nome: true } } } } },
    });

    return this.toResponseFromInclude(updated);
  }

  async delete(tenantId: string | null, id: string): Promise<void> {
    this.assertTenantId(tenantId);
    const p = await this.findParticipanteOrFail(tenantId, id);

    const cotasAtivas = await this.prisma.cota.count({
      where: { participanteId: p.id, statusPagamento: { in: ['PAGO', 'PENDENTE'] } },
    });

    if (cotasAtivas > 0) {
      throw new BusinessException(
        'PARTICIPANTE_COM_COTAS_ATIVAS',
        `Não é possível excluir participante com ${cotasAtivas} cota(s) ativa(s)`,
        [],
      );
    }

    await this.prisma.participante.delete({ where: { id: p.id } });
  }

  // Upsert usado internamente ao criar cota com celular
  async upsertParaCota(
    tenantId: string,
    nome: string,
    numeroCelular: string,
  ): Promise<string> {
    const existente = await this.prisma.participante.findUnique({
      where: { tenantId_numeroCelular: { tenantId, numeroCelular } },
    });

    if (existente) return existente.id;

    const criado = await this.prisma.participante.create({
      data: { tenantId, nome: nome.toUpperCase(), numeroCelular },
    });

    return criado.id;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async findParticipanteOrFail(tenantId: string, id: string): Promise<Participante> {
    const p = await this.prisma.participante.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException({ statusCode: 404, error: 'PARTICIPANTE_NAO_ENCONTRADO', message: `Participante ${id} não encontrado`, details: [] });
    return p;
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }

  private toResponseFromInclude(
    p: Participante & { cotas: { bolaoId: string; bolao: { id: string; nome: string } }[] },
  ): ParticipanteResponse {
    const byCota = new Map<string, { id: string; nome: string; cotasCount: number }>();
    for (const c of p.cotas) {
      const entry = byCota.get(c.bolaoId);
      if (entry) {
        entry.cotasCount++;
      } else {
        byCota.set(c.bolaoId, { id: c.bolao.id, nome: c.bolao.nome, cotasCount: 1 });
      }
    }

    return this.toResponse(p, p.cotas.length, Array.from(byCota.values()));
  }

  private toResponse(
    p: Participante,
    totalCotas: number,
    boloes: { id: string; nome: string; cotasCount: number }[],
  ): ParticipanteResponse {
    return {
      id: p.id,
      tenantId: p.tenantId,
      nome: p.nome,
      numeroCelular: p.numeroCelular,
      email: p.email,
      observacoes: p.observacoes,
      totalCotas,
      boloes,
      criadoEm: p.criadoEm.toISOString(),
      atualizadoEm: p.atualizadoEm.toISOString(),
    };
  }
}
