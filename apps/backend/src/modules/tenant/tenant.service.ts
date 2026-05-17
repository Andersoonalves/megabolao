import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant as PrismaTenant } from '@prisma/client';
import { TenantBranding } from '@nossobolao/shared-types';
import { PaginatedResponse } from '@nossobolao/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateOwnTenantDto } from './dto/update-own-tenant.dto';
import { UpdateAdminInfoDto } from './dto/update-admin-info.dto';

export interface AdminInfoResponse {
  nome?: string;
  email: string;
  celular?: string;
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Impede cadastros de bolão, cotas e participantes quando o tenant não está ATIVO
   * (ex.: suspenso pelo MASTER ou inativo).
   */
  async assertTenantPermiteCadastros(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'TENANT_NAO_ENCONTRADO',
        message: `Tenant ${tenantId} não encontrado`,
        details: [],
      });
    }
    if (tenant.status !== 'ATIVO') {
      const detalhe =
        tenant.status === 'SUSPENSO'
          ? 'Tenant suspenso — não é permitido cadastrar bolões, cotas ou participantes.'
          : 'Tenant inativo — não é permitido cadastrar bolões, cotas ou participantes.';
      throw new BusinessException(
        'TENANT_CADASTROS_BLOQUEADOS',
        detalhe,
        [{ field: 'tenant', code: 'TENANT_STATUS', message: `Status: ${tenant.status}` }],
      );
    }
  }

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

    try {
      await this.provisionarModulos(tenant.id);
      await this.provisionarAdmin(tenant.id, dto.adminEmail, dto.adminSenha, dto.adminNome, dto.adminCelular);
    } catch (err) {
      await this.prisma.tenant.delete({ where: { id: tenant.id } });
      throw err;
    }

    return this.toResponse(tenant);
  }

  private async provisionarModulos(tenantId: string): Promise<void> {
    const modulos = await this.prisma.modulo.findMany({ where: { apenasMaster: false } });
    await this.prisma.moduloTenant.createMany({
      data: modulos.map((m) => ({ tenantId, moduloCodigo: m.codigo })),
      skipDuplicates: true,
    });
  }

  private async provisionarAdmin(
    tenantId: string,
    email: string,
    senha: string,
    nome?: string,
    celular?: string,
  ): Promise<void> {
    // 1. Perfil "Administrador" do tenant (cria se não existir)
    const perfil = await this.prisma.perfil.upsert({
      where: { tenantId_nome: { tenantId, nome: 'Administrador' } },
      update: {},
      create: {
        tenantId,
        nome: 'Administrador',
        descricao: 'Acesso completo ao tenant — perfil do sistema',
        prioridade: 1000,
        sistema: true,
      },
    });

    // 2. Garante que todas as permissões não-MASTER estão no perfil
    const todasPermissoes = await this.prisma.permissao.findMany({ where: { apenasMaster: false } });
    await this.prisma.perfilPermissao.createMany({
      data: todasPermissoes.map((p) => ({ perfilId: perfil.id, permissaoCodigo: p.codigo })),
      skipDuplicates: true,
    });

    // 3. Cria usuário no Supabase Auth
    const { data, error } = await this.supabase.admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { papel: 'ADMIN', tenant_id: tenantId, ...(nome && { nome }), ...(celular && { celular }) },
    });

    if (error) {
      if (error.message?.includes('already been registered') || error.code === 'email_exists') {
        throw new BusinessException(
          'ADMIN_EMAIL_JA_EXISTE',
          `Email "${email}" já está em uso em outro tenant`,
          [{ field: 'adminEmail', code: 'ADMIN_EMAIL_JA_EXISTE', message: 'Email já cadastrado' }],
        );
      }
      throw new BusinessException(
        'ERRO_CRIAR_ADMIN',
        `Erro ao criar usuário admin: ${error.message}`,
        [],
      );
    }

    // 4. Cria UserProfile
    await this.prisma.userProfile.create({
      data: {
        id: data.user.id,
        tenantId,
        papel: 'ADMIN',
        celular: celular ?? null,
      },
    });

    // 5. Vincula ao perfil "Administrador"
    await this.prisma.usuarioPerfil.create({
      data: { userId: data.user.id, perfilId: perfil.id },
    });

    // 6. Pré-popula permissoes no JWT (evita lazy-sync no primeiro login)
    const codigos = todasPermissoes.map((p) => p.codigo).sort();
    await this.supabase.admin.auth.admin.updateUserById(data.user.id, {
      user_metadata: {
        papel: 'ADMIN',
        tenant_id: tenantId,
        ...(nome && { nome }),
        ...(celular && { celular }),
        permissoes: codigos,
        permissoes_rev: new Date().toISOString(),
      },
    });
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

  async resetarSenhaAdmin(tenantId: string, novaSenha: string): Promise<void> {
    const perfil = await this.prisma.userProfile.findFirst({
      where: { tenantId, papel: 'ADMIN' },
    });

    if (!perfil) {
      throw new BusinessException(
        'ADMIN_NAO_ENCONTRADO',
        'Nenhum usuário ADMIN encontrado para este tenant',
        [],
      );
    }

    const { error } = await this.supabase.admin.auth.admin.updateUserById(perfil.id, {
      password: novaSenha,
    });

    if (error) {
      throw new BusinessException(
        'ERRO_RESETAR_SENHA',
        `Erro ao redefinir senha: ${error.message}`,
        [],
      );
    }
  }

  async getAdminInfo(tenantId: string): Promise<AdminInfoResponse> {
    const perfil = await this.prisma.userProfile.findFirst({
      where: { tenantId, papel: 'ADMIN' },
    });

    if (!perfil) {
      throw new BusinessException('ADMIN_NAO_ENCONTRADO', 'Nenhum usuário ADMIN encontrado para este tenant', []);
    }

    const { data, error } = await this.supabase.admin.auth.admin.getUserById(perfil.id);
    if (error) {
      throw new BusinessException('ERRO_BUSCAR_ADMIN', `Erro ao buscar admin: ${error.message}`, []);
    }

    return {
      nome: data.user.user_metadata?.['nome'] as string | undefined,
      email: data.user.email ?? '',
      celular: perfil.celular ?? undefined,
    };
  }

  async atualizarInfoAdmin(tenantId: string, dto: UpdateAdminInfoDto): Promise<void> {
    const perfil = await this.prisma.userProfile.findFirst({
      where: { tenantId, papel: 'ADMIN' },
    });

    if (!perfil) {
      throw new BusinessException('ADMIN_NAO_ENCONTRADO', 'Nenhum usuário ADMIN encontrado para este tenant', []);
    }

    const payload: Record<string, unknown> = {};
    if (dto.adminEmail) {
      payload['email'] = dto.adminEmail;
      payload['email_confirm'] = true;
    }
    if (dto.adminNome !== undefined || dto.adminCelular !== undefined) {
      payload['user_metadata'] = {
        papel: 'ADMIN',
        tenant_id: tenantId,
        ...(dto.adminNome !== undefined && { nome: dto.adminNome }),
        ...(dto.adminCelular !== undefined && { celular: dto.adminCelular }),
      };
    }

    if (Object.keys(payload).length > 0) {
      const { error } = await this.supabase.admin.auth.admin.updateUserById(
        perfil.id,
        payload as Parameters<typeof this.supabase.admin.auth.admin.updateUserById>[1],
      );
      if (error) {
        throw new BusinessException('ERRO_ATUALIZAR_ADMIN', `Erro ao atualizar admin: ${error.message}`, []);
      }
    }

    if (dto.adminCelular !== undefined) {
      await this.prisma.userProfile.update({
        where: { id: perfil.id },
        data: { celular: dto.adminCelular || null },
      });
    }
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
