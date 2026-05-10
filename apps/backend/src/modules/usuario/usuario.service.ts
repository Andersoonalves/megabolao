import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UsuarioRBAC } from '@nossobolao/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from '../auth/auth.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AtribuirPerfisDto } from './dto/atribuir-perfis.dto';
import { CreateUsuarioDto } from './dto/create-usuario.dto';

interface SupabaseAdminUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/**
 * UsuarioService — gestão de usuários por tenant.
 *
 * Cria/lista/edita/remove usuários do tenant via Supabase Admin API
 * + propaga atribuição de perfis no banco (`usuario_perfis`).
 *
 * NÃO opera fora do tenant atual: queries cruzam `user_profiles.tenant_id`
 * e perfis vêm sempre filtrados pelo `tenantId` do invocante.
 */
@Injectable()
export class UsuarioService {
  private readonly logger = new Logger(UsuarioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ── Read ─────────────────────────────────────────────────────────────────

  async findAll(tenantId: string | null): Promise<UsuarioRBAC[]> {
    this.assertTenantId(tenantId);

    const profiles = await this.prisma.userProfile.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
    });

    if (!profiles.length) return [];

    // Carrega perfis atribuídos para todos os usuários em uma query
    const userIds = profiles.map((p) => p.id);
    const atribuicoes = await this.prisma.usuarioPerfil.findMany({
      where: { userId: { in: userIds }, perfil: { tenantId } },
      include: { perfil: { include: { permissoes: true } } },
    });

    // Busca dados do Supabase Auth (email, datas) — em paralelo
    const supabaseUsers = await this.fetchSupabaseUsers(userIds);

    return profiles.map((p) => {
      const su = supabaseUsers.get(p.id);
      const userAtribs = atribuicoes.filter((a) => a.userId === p.id);
      const perfis = userAtribs.map((a) => ({
        id: a.perfil.id,
        nome: a.perfil.nome,
        sistema: a.perfil.sistema,
      }));
      const permSet = new Set<string>();
      for (const a of userAtribs) {
        for (const pp of a.perfil.permissoes) permSet.add(pp.permissaoCodigo);
      }

      return {
        id: p.id,
        email: su?.email ?? '',
        papel: p.papel,
        tenantId: p.tenantId,
        celular: p.celular,
        perfis,
        permissoes: [...permSet].sort(),
        criadoEm: p.criadoEm.toISOString(),
        atualizadoEm: p.atualizadoEm.toISOString(),
      };
    });
  }

  async findById(tenantId: string | null, userId: string): Promise<UsuarioRBAC> {
    this.assertTenantId(tenantId);
    const profile = await this.prisma.userProfile.findFirst({ where: { id: userId, tenantId } });
    if (!profile) throw this.notFound(userId);

    const atribuicoes = await this.prisma.usuarioPerfil.findMany({
      where: { userId, perfil: { tenantId } },
      include: { perfil: { include: { permissoes: true } } },
    });

    const su = (await this.fetchSupabaseUsers([userId])).get(userId);

    const permSet = new Set<string>();
    for (const a of atribuicoes) {
      for (const pp of a.perfil.permissoes) permSet.add(pp.permissaoCodigo);
    }

    return {
      id: profile.id,
      email: su?.email ?? '',
      papel: profile.papel,
      tenantId: profile.tenantId,
      celular: profile.celular,
      perfis: atribuicoes.map((a) => ({
        id: a.perfil.id, nome: a.perfil.nome, sistema: a.perfil.sistema,
      })),
      permissoes: [...permSet].sort(),
      criadoEm: profile.criadoEm.toISOString(),
      atualizadoEm: profile.atualizadoEm.toISOString(),
    };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async create(
    invocador: AuthenticatedUser,
    tenantId: string | null,
    dto: CreateUsuarioDto,
  ): Promise<UsuarioRBAC> {
    this.assertTenantId(tenantId);
    await this.validarPerfisDoTenant(tenantId, dto.perfilIds);

    // 1. Cria usuário no Supabase Auth — sem senha (invite via e-mail)
    const { data, error } = await this.supabase.admin.auth.admin.inviteUserByEmail(
      dto.email,
      {
        data: {
          papel: 'ADMIN',
          tenant_id: tenantId,
          celular: dto.celular ?? null,
          nome: dto.nome ?? null,
        },
      },
    );

    if (error || !data?.user) {
      throw new BusinessException(
        'USUARIO_NAO_CRIADO',
        `Falha ao convidar usuário: ${error?.message ?? 'desconhecido'}`,
      );
    }

    const userId = data.user.id;

    // 2. user_profiles é normalmente populada por trigger no Supabase, mas
    //    garantimos por upsert defensivo (idempotente)
    await this.prisma.userProfile.upsert({
      where: { id: userId },
      create: { id: userId, tenantId, papel: 'ADMIN', celular: dto.celular ?? null },
      update: { tenantId, celular: dto.celular ?? null },
    });

    // 3. Atribui perfis
    if (dto.perfilIds.length) {
      await this.prisma.usuarioPerfil.createMany({
        data: dto.perfilIds.map((perfilId) => ({
          userId, perfilId, atribuidoPor: invocador.id,
        })),
        skipDuplicates: true,
      });
    }

    // 4. Sincroniza permissões no JWT
    await this.auth.syncUserPermissions(userId);

    await this.auditoria.registrar({
      tenantId,
      userId: invocador.id,
      userEmail: invocador.email,
      acao: 'USUARIO_CRIADO',
      recurso: 'USUARIO',
      recursoId: userId,
      detalhes: { email: dto.email, perfis: dto.perfilIds },
    });

    return this.findById(tenantId, userId);
  }

  async atribuirPerfis(
    invocador: AuthenticatedUser,
    tenantId: string | null,
    userId: string,
    dto: AtribuirPerfisDto,
  ): Promise<UsuarioRBAC> {
    this.assertTenantId(tenantId);

    const target = await this.prisma.userProfile.findFirst({
      where: { id: userId, tenantId },
    });
    if (!target) throw this.notFound(userId);

    await this.validarPerfisDoTenant(tenantId, dto.perfilIds);

    const atual = await this.prisma.usuarioPerfil.findMany({
      where: { userId, perfil: { tenantId } },
      select: { perfilId: true },
    });
    const atualSet = new Set(atual.map((a) => a.perfilId));
    const novoSet = new Set(dto.perfilIds);

    const aRemover = [...atualSet].filter((id) => !novoSet.has(id));
    const aAdicionar = [...novoSet].filter((id) => !atualSet.has(id));

    await this.prisma.$transaction(async (tx) => {
      if (aRemover.length) {
        await tx.usuarioPerfil.deleteMany({
          where: { userId, perfilId: { in: aRemover } },
        });
      }
      if (aAdicionar.length) {
        await tx.usuarioPerfil.createMany({
          data: aAdicionar.map((perfilId) => ({
            userId, perfilId, atribuidoPor: invocador.id,
          })),
          skipDuplicates: true,
        });
      }
    });

    await this.auth.syncUserPermissions(userId);

    await this.auditoria.registrar({
      tenantId,
      userId: invocador.id,
      userEmail: invocador.email,
      acao: 'USUARIO_PERFIS_ALTERADOS',
      recurso: 'USUARIO',
      recursoId: userId,
      detalhes: { adicionados: aAdicionar, removidos: aRemover },
    });

    return this.findById(tenantId, userId);
  }

  async delete(
    invocador: AuthenticatedUser,
    tenantId: string | null,
    userId: string,
  ): Promise<void> {
    this.assertTenantId(tenantId);

    if (userId === invocador.id) {
      throw new BusinessException(
        'AUTOEXCLUSAO_BLOQUEADA',
        'Você não pode excluir a si mesmo',
      );
    }

    const target = await this.prisma.userProfile.findFirst({
      where: { id: userId, tenantId },
    });
    if (!target) throw this.notFound(userId);

    // Remove do Supabase Auth (user_profiles cascateia via FK ON DELETE CASCADE)
    const { error } = await this.supabase.admin.auth.admin.deleteUser(userId);
    if (error) {
      this.logger.error(`Falha ao excluir user ${userId} no Supabase: ${error.message}`);
      throw new BusinessException('USUARIO_NAO_REMOVIDO', error.message);
    }

    await this.auditoria.registrar({
      tenantId,
      userId: invocador.id,
      userEmail: invocador.email,
      acao: 'USUARIO_EXCLUIDO',
      recurso: 'USUARIO',
      recursoId: userId,
      severidade: 'AVISO',
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async validarPerfisDoTenant(tenantId: string, perfilIds: string[]): Promise<void> {
    if (!perfilIds.length) return;

    const found = await this.prisma.perfil.findMany({
      where: { id: { in: perfilIds }, tenantId },
      select: { id: true },
    });

    const foundSet = new Set(found.map((p) => p.id));
    const ausentes = perfilIds.filter((id) => !foundSet.has(id));
    if (ausentes.length) {
      throw new BusinessException(
        'PERFIL_NAO_PERTENCE_AO_TENANT',
        `Perfil(is) inválido(s): ${ausentes.join(', ')}`,
      );
    }
  }

  private async fetchSupabaseUsers(ids: string[]): Promise<Map<string, SupabaseAdminUser>> {
    const out = new Map<string, SupabaseAdminUser>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          const { data } = await this.supabase.admin.auth.admin.getUserById(id);
          if (data?.user) out.set(id, data.user as SupabaseAdminUser);
        } catch (err) {
          this.logger.debug(`Não foi possível buscar user ${id} no Supabase: ${(err as Error).message}`);
        }
      }),
    );
    return out;
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      error: 'USUARIO_NAO_ENCONTRADO',
      message: `Usuário ${id} não encontrado neste tenant`,
      details: [],
    });
  }

  private assertTenantId(tenantId: string | null): asserts tenantId is string {
    if (!tenantId) throw new ForbiddenException('TENANT_ID_OBRIGATORIO');
  }
}
