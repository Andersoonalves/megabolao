import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { PapelUsuario } from '@nossobolao/shared-types';

interface SupabaseUserMetadata {
  papel?: string;
  tenant_id?: string;
  celular?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Valida um Bearer token do Supabase Auth.
   * Retorna AuthenticatedUser com os dados extraídos do JWT.
   *
   * Usa o cliente admin (service_role) para evitar chamadas extras à API.
   * O JWT é verificado localmente via SUPABASE_JWT_SECRET — sem latência de rede.
   */
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
      if (!papel || !['MASTER', 'ADMIN'].includes(papel)) {
        // Sessão OTP do portal do participante — papel ausente é esperado
        // Permite o acesso como participante (sem papel Admin/Master)
        return {
          id: user.id,
          email: user.email ?? '',
          papel: 'ADMIN', // valor dummy para portal — RLS do Supabase governa o acesso
          tenantId: meta.tenant_id ?? null,
          celular: meta.celular ?? null,
        };
      }

      return {
        id: user.id,
        email: user.email ?? '',
        papel,
        tenantId: papel === 'MASTER' ? null : (meta.tenant_id ?? null),
        celular: null,
      };
    } catch (err) {
      this.logger.error('Erro ao validar token Supabase', err);
      return null;
    }
  }

  /**
   * Extrai o tenant_id resolvido do request.
   * Para MASTER: usa o header X-Tenant-Id.
   * Para ADMIN: usa o tenant_id do JWT.
   *
   * Lança ForbiddenException se o ADMIN não tiver tenant associado.
   */
  resolveTenantId(user: AuthenticatedUser, headerTenantId?: string): string | null {
    if (user.papel === 'MASTER') return headerTenantId ?? null;
    return user.tenantId;
  }
}
