import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenantId?: string | null;
      rawToken?: string;
      /** Nível de garantia de autenticação do JWT Supabase: 'aal1' | 'aal2'. */
      aal?: string;
    }
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      // Decodifica JWT (sem verificar assinatura — Supabase já validou)
      // para extrair o claim `aal` (Authentication Assurance Level)
      try {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
        ) as { aal?: string };
        req.aal = payload.aal;
      } catch {
        // JWT malformado — getUser() vai rejeitar também
      }

      const user = await this.authService.validateToken(token);

      if (user) {
        req.user = user;
        req.rawToken = token;
        req.tenantId = this.authService.resolveTenantId(
          user,
          req.headers['x-tenant-id'] as string | undefined,
        );
      }
    }

    next();
  }
}
