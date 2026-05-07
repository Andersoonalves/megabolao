import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PapelUsuario } from '@nossobolao/shared-types';
import { ROLES_KEY } from './decorators/roles.decorator';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PapelUsuario[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    if (!user || !requiredRoles.includes(user.papel)) {
      throw new ForbiddenException('PAPEL_INSUFICIENTE');
    }

    return true;
  }
}
