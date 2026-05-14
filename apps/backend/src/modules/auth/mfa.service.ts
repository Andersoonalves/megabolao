import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { BusinessException } from '../../common/exceptions/business.exception';

interface SupabaseFactor {
  id: string;
  factor_type: string;
  friendly_name?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  /** Marca mfa_enrolled=true no user_metadata (chamado pelo frontend após enroll bem-sucedido). */
  async setMfaEnrolled(userId: string, enrolled: boolean): Promise<void> {
    const { data: current } = await this.supabase.admin.auth.admin.getUserById(userId);
    const meta = (current?.user?.user_metadata ?? {}) as Record<string, unknown>;

    const { error } = await this.supabase.admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...meta, mfa_enrolled: enrolled },
    });

    if (error) {
      throw new BusinessException('MFA_SYNC_ERRO', `Falha ao atualizar status 2FA: ${error.message}`);
    }
  }

  /** Lista fatores TOTP do usuário via Supabase Admin REST API. */
  async listarFatores(userId: string): Promise<SupabaseFactor[]> {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY');

    const res = await fetch(`${url}/auth/v1/admin/users/${userId}/factors`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });

    if (!res.ok) {
      this.logger.warn(`Falha ao listar fatores do user ${userId}: ${res.status}`);
      return [];
    }

    return res.json() as Promise<SupabaseFactor[]>;
  }

  /**
   * Remove todos os fatores TOTP do próprio usuário via Admin API.
   * Inclui fatores não verificados (pendentes) que o SDK client não consegue listar.
   * Chamado antes de um novo enrollment para evitar conflito de nome.
   */
  async limparFatoresPropriosAdmin(userId: string): Promise<void> {
    const fatores = await this.listarFatores(userId);
    const totp = fatores.filter(f => f.factor_type === 'totp');

    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY');

    for (const fator of totp) {
      await fetch(`${url}/auth/v1/admin/users/${userId}/factors/${fator.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      }).catch(() => undefined);
    }

    if (totp.length > 0) {
      await this.setMfaEnrolled(userId, false);
    }
  }

  /**
   * Remove TODOS os fatores TOTP do usuário.
   * Usado por Admin/Master para resetar 2FA de outro usuário.
   */
  async resetarMfa(targetUserId: string, solicitanteId: string, solicitantePapel: string): Promise<void> {
    if (solicitantePapel !== 'MASTER' && solicitantePapel !== 'ADMIN') {
      throw new ForbiddenException('PERMISSAO_INSUFICIENTE');
    }

    // Master pode resetar qualquer um; Admin verifica que não é Master
    if (solicitantePapel === 'ADMIN') {
      const { data } = await this.supabase.admin.auth.admin.getUserById(targetUserId);
      const papel = data?.user?.user_metadata?.papel as string | undefined;
      if (papel === 'MASTER') {
        throw new ForbiddenException('ADMIN_NAO_PODE_RESETAR_MASTER');
      }
      if (targetUserId === solicitanteId) {
        throw new BusinessException('USE_AUTO_DESATIVAR', 'Use a tela de Minha Conta para desativar seu próprio 2FA');
      }
    }

    const fatores = await this.listarFatores(targetUserId);
    const totp = fatores.filter(f => f.factor_type === 'totp');

    if (totp.length === 0) {
      throw new NotFoundException({ statusCode: 404, error: 'MFA_NAO_CONFIGURADO', message: 'Usuário não tem 2FA configurado' });
    }

    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY');

    for (const fator of totp) {
      const res = await fetch(`${url}/auth/v1/admin/users/${targetUserId}/factors/${fator.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      });
      if (!res.ok) {
        this.logger.error(`Falha ao deletar fator ${fator.id} do user ${targetUserId}: ${res.status}`);
      }
    }

    await this.setMfaEnrolled(targetUserId, false);
    this.logger.log(`2FA resetado para user ${targetUserId} por ${solicitanteId}`);
  }
}
