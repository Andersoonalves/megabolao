import { PapelUsuario } from '@nossobolao/shared-types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  papel: PapelUsuario;
  tenantId: string | null;
  celular: string | null;
}
