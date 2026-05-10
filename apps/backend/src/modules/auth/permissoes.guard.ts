import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CodigoPermissao, WILDCARD_PERMISSAO } from '@nossobolao/shared-types';
import { PERMISSOES_KEY } from './decorators/permissions.decorator';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

/**
 * Guard que aplica controle de acesso por permissões granulares.
 *
 * - Permissões necessárias vêm do decorator `@RequerPermissoes(...)`.
 * - Usuário MASTER (com `*` em `permissoes`) sempre passa.
 * - Caso contrário, a interseção entre `requeridas` e `user.permissoes`
 *   precisa cobrir TODAS as permissões requeridas (AND).
 *
 * Convive com `RolesGuard`. Se um endpoint tem só `@Roles(...)`, esse guard
 * é no-op. Se tem só `@RequerPermissoes(...)`, o RolesGuard é no-op.
 */
@Injectable()
export class PermissoesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridas = this.reflector.getAllAndOverride<CodigoPermissao[]>(PERMISSOES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requeridas?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();

    if (!user) throw new ForbiddenException('AUTENTICACAO_NECESSARIA');

    const efetivas = user.permissoes ?? [];

    // MASTER (curinga global) atalha tudo
    if (efetivas.includes(WILDCARD_PERMISSAO)) return true;

    const faltantes = requeridas.filter((p) => !efetivas.includes(p));
    if (faltantes.length) {
      throw new ForbiddenException(
        `PERMISSAO_INSUFICIENTE: faltam [${faltantes.join(', ')}]`,
      );
    }

    return true;
  }
}
