import { SetMetadata } from '@nestjs/common';
import { CodigoPermissao } from '@nossobolao/shared-types';

export const PERMISSOES_KEY = 'permissoes';

/**
 * Marca um endpoint exigindo permissões granulares.
 *
 * Semântica: o usuário precisa de **todas** as permissões listadas (AND).
 * MASTER (`*` no JWT) sempre passa. Use múltiplos decorators para OR
 * (não suportado nativamente — desambigue separando endpoints).
 *
 * Exemplo:
 *   @RequerPermissoes('bolao.criar')
 *   @Post()
 *   create(...) {}
 */
export const RequerPermissoes = (...permissoes: CodigoPermissao[]) =>
  SetMetadata(PERMISSOES_KEY, permissoes);
