import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user) throw new UnauthorizedException('AUTENTICACAO_NECESSARIA');

    return true;
  }
}
