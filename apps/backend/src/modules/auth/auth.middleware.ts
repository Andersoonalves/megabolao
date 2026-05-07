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
