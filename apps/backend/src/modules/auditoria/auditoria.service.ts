import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditoriaSeveridade, AuditoriaItem, PaginatedResponse } from '@nossobolao/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RegistrarAuditoriaInput {
  tenantId: string | null;
  userId: string | null;
  userEmail?: string | null;
  acao: string;
  recurso?: string | null;
  recursoId?: string | null;
  severidade?: AuditoriaSeveridade;
  detalhes?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ListarAuditoriaQuery {
  page?: number;
  perPage?: number;
  acao?: string;
  recurso?: string;
  severidade?: AuditoriaSeveridade;
  userId?: string;
  desde?: string;  // ISO date
  ate?: string;    // ISO date
}

/**
 * AuditoriaService — registra e consulta a trilha de auditoria.
 *
 * Falhas de gravação NUNCA propagam: o log é best-effort para não bloquear
 * operações de negócio. Falhas são logadas no logger do app.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrar(input: RegistrarAuditoriaInput): Promise<void> {
    try {
      await this.prisma.auditoria.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          userEmail: input.userEmail ?? null,
          acao: input.acao,
          recurso: input.recurso ?? null,
          recursoId: input.recursoId ?? null,
          severidade: input.severidade ?? 'INFO',
          detalhes: (input.detalhes ?? {}) as Prisma.InputJsonValue,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao registrar auditoria ${input.acao}`, err as Error);
    }
  }

  async listar(
    tenantId: string | null,
    q: ListarAuditoriaQuery = {},
  ): Promise<PaginatedResponse<AuditoriaItem>> {
    this.assertTenantId(tenantId);

    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const skip = (page - 1) * perPage;

    const where: Prisma.AuditoriaWhereInput = {
      tenantId,
      ...(q.acao       && { acao: q.acao }),
      ...(q.recurso    && { recurso: q.recurso }),
      ...(q.severidade && { severidade: q.severidade }),
      ...(q.userId     && { userId: q.userId }),
      ...((q.desde || q.ate) && {
        criadoEm: {
          ...(q.desde && { gte: new Date(q.desde) }),
          ...(q.ate   && { lte: new Date(q.ate) }),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditoria.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.auditoria.count({ where }),
    ]);

    return {
      data: data.map((a) => this.toResponse(a)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  private toResponse(a: Prisma.AuditoriaGetPayload<Record<string, never>>): AuditoriaItem {
    return {
      id: a.id,
      tenantId: a.tenantId,
      userId: a.userId,
      userEmail: a.userEmail,
      acao: a.acao,
      recurso: a.recurso,
      recursoId: a.recursoId,
      severidade: a.severidade,
      detalhes: (a.detalhes ?? {}) as Record<string, unknown>,
      ip: a.ip,
      userAgent: a.userAgent,
      criadoEm: a.criadoEm.toISOString(),
    };
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }
}
