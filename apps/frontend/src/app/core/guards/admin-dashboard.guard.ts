import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * O dashboard admin lista bolões/cotas do tenant — MASTER não tem tenant.
 * Redireciona MASTER para a visão da plataforma.
 */
export const adminDashboardGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const resolve = (): boolean | ReturnType<Router['parseUrl']> =>
    auth.isMaster() ? router.parseUrl('/dashboard-master') : true;

  if (!auth.loading()) return resolve();

  return toObservable(auth.loading).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => resolve()),
  );
};
