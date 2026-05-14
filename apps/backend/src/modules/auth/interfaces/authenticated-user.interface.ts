import { CodigoPermissao, PapelUsuario } from '@nossobolao/shared-types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  papel: PapelUsuario;
  tenantId: string | null;
  celular: string | null;
  /** Permissões efetivas resolvidas (união dos perfis). MASTER recebe `['*']`. */
  permissoes: CodigoPermissao[];
  /** 2FA TOTP ativo para este usuário (lido de user_metadata.mfa_enrolled). */
  mfaEnrolled: boolean;
}
