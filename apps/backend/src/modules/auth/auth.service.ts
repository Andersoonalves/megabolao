import { Injectable, Logger } from '@nestjs/common';
import { PapelUsuario } from '@nossobolao/shared-types';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

interface SupabaseUserMetadata {
  papel?: string;
  tenant_id?: string;
  celular?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabase: SupabaseService) {}

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
      if (!papel || !(['MASTER', 'ADMIN'] as PapelUsuario[]).includes(papel)) {
        // Sessão OTP do portal — papel ausente é esperado; RLS do Supabase governa acesso
        return {
          id: user.id,
          email: user.email ?? '',
          papel: 'ADMIN',
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

  resolveTenantId(user: AuthenticatedUser, headerTenantId?: string): string | null {
    if (user.papel === 'MASTER') return headerTenantId ?? null;
    return user.tenantId;
  }
}
