import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    return ctx.switchToHttp().getRequest<{ tenantId?: string | null }>().tenantId ?? null;
  },
);
