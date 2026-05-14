import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

/**
 * Guard global que exige AAL2 (TOTP verificado) quando o usuário tem 2FA ativado.
 * Se o token tiver aal1 mas mfaEnrolled=true → rejeita com MFA_REQUIRED.
 * Rotas @Public() e endpoints de MFA (/auth/mfa/*) são isentos.
 */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      aal?: string;
      path?: string;
    }>();

    // Sem usuário autenticado → JwtAuthGuard já rejeitará
    if (!req.user) return true;

    // Portal participante nunca usa 2FA admin
    if (!req.user.mfaEnrolled) return true;

    // Endpoints de gerenciamento do próprio MFA ficam isentos para evitar deadlock
    if (req.path?.startsWith('/api/v1/auth/mfa')) return true;

    if (req.aal !== 'aal2') {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'MFA_REQUIRED',
        message: 'Autenticação de dois fatores necessária. Insira o código TOTP.',
      });
    }

    return true;
  }
}
