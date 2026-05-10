import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { CodigoPermissao } from '@nossobolao/shared-types';
import { AuthService } from '../services/auth.service';

/**
 * Guard de rota que exige uma OU mais permissões granulares.
 * Uso:
 *   { path: 'perfis', canActivate: [permissaoGuard(['perfil.ler'])] }
 */
export function permissaoGuard(
  codigos: CodigoPermissao | CodigoPermissao[],
  modo: 'qualquer' | 'todas' = 'qualquer',
): CanActivateFn {
  const lista = Array.isArray(codigos) ? codigos : [codigos];

  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return toObservable(auth.loading).pipe(
      filter((loading) => !loading),
      take(1),
      map(() => {
        if (!auth.isAuthenticated()) {
          return router.createUrlTree(['/login']);
        }
        const permitido = modo === 'todas'
          ? auth.temTodasPermissoes(lista)
          : auth.temAlgumaPermissao(lista);
        return permitido || router.createUrlTree(['/dashboard']);
      }),
    );
  };
}
