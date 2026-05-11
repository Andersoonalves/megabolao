import { Injectable, Logger } from '@nestjs/common';
import { CodigoPermissao, PapelUsuario, WILDCARD_PERMISSAO } from '@nossobolao/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

interface SupabaseUserMetadata {
  papel?: string;
  tenant_id?: string;
  celular?: string;
  permissoes?: string[];
  permissoes_rev?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  async validateToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const { data, error } = await this.supabase.admin.auth.getUser(token);

      if (error || !data.user) {
        this.logger.debug(`Token inválido: ${error?.message ?? 'usuário não encontrado'}`);
        return null;
      }

      const user = data.user;
      const meta = (user.user_metadata ?? {}) as SupabaseUserMetadata;

      const papel = meta.papel as PapelUsuario | undefined;

      // Sessão OTP (portal participante) — sem papel definido. RLS Supabase governa.
      if (!papel || !(['MASTER', 'ADMIN'] as PapelUsuario[]).includes(papel)) {
        return {
          id: user.id,
          email: user.email ?? '',
          papel: 'ADMIN',
          tenantId: meta.tenant_id ?? null,
          celular: meta.celular ?? user.phone ?? null,
          permissoes: [],
        };
      }

      // MASTER: curinga global
      if (papel === 'MASTER') {
        return {
          id: user.id,
          email: user.email ?? '',
          papel,
          tenantId: null,
          celular: null,
          permissoes: [WILDCARD_PERMISSAO],
        };
      }

      // ADMIN: usa permissões cacheadas no JWT.
      // Lazy-sync: usuários pré-RBAC ainda não têm `permissoes_rev` →
      // sincroniza uma vez para popular o JWT no próximo refresh.
      let permissoes = Array.isArray(meta.permissoes) ? meta.permissoes : [];
      if (!meta.permissoes_rev) {
        try {
          permissoes = await this.syncUserPermissions(user.id);
        } catch (err) {
          this.logger.warn(`Falha no lazy-sync de permissões para ${user.id}`, err as Error);
        }
      }

      return {
        id: user.id,
        email: user.email ?? '',
        papel,
        tenantId: meta.tenant_id ?? null,
        celular: null,
        permissoes,
      };
    } catch (err) {
      this.logger.error('Erro ao validar token Supabase', err);
      return null;
    }
  }

  resolveTenantId(user: AuthenticatedUser, headerTenantId?: string): string | null {
    if (user.papel === 'MASTER') return headerTenantId ?? null;
    return user.tenantId;
  }

  /**
   * Calcula a união das permissões dos perfis ativos atribuídos ao usuário.
   * Retorna lista deduplicada e ordenada (estável para snapshot/testes).
   */
  async resolveEffectivePermissions(userId: string): Promise<CodigoPermissao[]> {
    const rows = await this.prisma.usuarioPerfil.findMany({
      where: { perfil: { ativo: true } , userId },
      select: {
        perfil: {
          select: {
            permissoes: { select: { permissaoCodigo: true } },
          },
        },
      },
    });

    const set = new Set<string>();
    for (const r of rows) {
      for (const p of r.perfil.permissoes) set.add(p.permissaoCodigo);
    }
    return [...set].sort();
  }

  /**
   * Sincroniza `user_metadata.permissoes` do Supabase Auth com a união
   * dos perfis atuais do usuário. Chamado após criar/editar perfis ou
   * atribuir/remover perfis de usuário.
   *
   * Importante: a alteração só aparece no token após o próximo refresh.
   * Para forçar refresh imediato, é possível chamar `signOut(scope:'others')`
   * — não fazemos no MVP para evitar UX ruim em sessões legítimas.
   */
  async syncUserPermissions(userId: string): Promise<CodigoPermissao[]> {
    const permissoes = await this.resolveEffectivePermissions(userId);
    const rev = new Date().toISOString();

    const { data: current } = await this.supabase.admin.auth.admin.getUserById(userId);
    const meta = (current?.user?.user_metadata ?? {}) as SupabaseUserMetadata;

    const { error } = await this.supabase.admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...meta, permissoes, permissoes_rev: rev },
    });

    if (error) {
      this.logger.warn(`Falha ao sincronizar permissões do user ${userId}: ${error.message}`);
    }

    return permissoes;
  }

  /**
   * Sincroniza permissões de TODOS os usuários atribuídos a um perfil.
   * Chamado quando as permissões de um perfil mudam.
   */
  async syncPerfilPermissions(perfilId: string): Promise<number> {
    const usuarios = await this.prisma.usuarioPerfil.findMany({
      where: { perfilId },
      select: { userId: true },
    });
    await Promise.all(usuarios.map((u) => this.syncUserPermissions(u.userId)));
    return usuarios.length;
  }
}
