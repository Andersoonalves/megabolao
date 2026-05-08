import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant as PrismaTenant } from '@prisma/client';
import { TenantBranding } from '@nossobolao/shared-types';
import { PaginatedResponse } from '@nossobolao/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateOwnTenantDto } from './dto/update-own-tenant.dto';

export interface TenantResponse {
  id: string;
  nome: string;
  slug: string;
  status: string;
  taxaAdministrativaPct: number;
  branding: TenantBranding;
  criadoEm: string;
  atualizadoEm: string;
}

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto): Promise<TenantResponse> {
    const slugExiste = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (slugExiste) {
      throw new BusinessException(
        'SLUG_JA_EXISTE',
        `Slug "${dto.slug}" já está em uso`,
        [{ field: 'slug', code: 'SLUG_JA_EXISTE', message: 'Slug já cadastrado' }],
      );
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        nome: dto.nome,
        slug: dto.slug,
        taxaAdministrativaPct: dto.taxaAdministrativaPct ?? 15,
        branding: (dto.branding ?? {}) as object,
      },
    });

    return this.toResponse(tenant);
  }

  async findAll({ page = 1, perPage = 20 }: PaginationDto): Promise<PaginatedResponse<TenantResponse>> {
    const skip = (page - 1) * perPage;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        skip,
        take: perPage,
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.tenant.count(),
    ]);

    return {
      data: data.map((t) => this.toResponse(t)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findById(id: string): Promise<TenantResponse> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'TENANT_NAO_ENCONTRADO',
        message: `Tenant ${id} não encontrado`,
        details: [],
      });
    }
    return this.toResponse(tenant);
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantResponse> {
    await this.findById(id);

    if (dto.slug) {
      const conflito = await this.prisma.tenant.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (conflito) {
        throw new BusinessException(
          'SLUG_JA_EXISTE',
          `Slug "${dto.slug}" já está em uso`,
          [{ field: 'slug', code: 'SLUG_JA_EXISTE', message: 'Slug já cadastrado' }],
        );
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.nome   !== undefined && { nome: dto.nome }),
        ...(dto.slug   !== undefined && { slug: dto.slug }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.taxaAdministrativaPct !== undefined && {
          taxaAdministrativaPct: dto.taxaAdministrativaPct,
        }),
        ...(dto.branding !== undefined && { branding: dto.branding as object }),
      },
    });

    return this.toResponse(updated);
  }

  async updateOwn(tenantId: string | null, dto: UpdateOwnTenantDto): Promise<TenantResponse> {
    if (!tenantId) throw new ForbiddenException('TENANT_NAO_ASSOCIADO');
    return this.update(tenantId, dto);
  }

  async deactivate(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.tenant.update({
      where: { id },
      data: { status: 'INATIVO' },
    });
  }

  private toResponse(t: PrismaTenant): TenantResponse {
    return {
      id: t.id,
      nome: t.nome,
      slug: t.slug,
      status: t.status,
      taxaAdministrativaPct: t.taxaAdministrativaPct.toNumber(),
      branding: (t.branding ?? {}) as TenantBranding,
      criadoEm: t.criadoEm.toISOString(),
      atualizadoEm: t.atualizadoEm.toISOString(),
    };
  }
}
