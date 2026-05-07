import { SetMetadata } from '@nestjs/common';
import { PapelUsuario } from '@nossobolao/shared-types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: PapelUsuario[]) => SetMetadata(ROLES_KEY, roles);
