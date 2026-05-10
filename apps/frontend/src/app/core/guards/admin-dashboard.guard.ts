import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MasterTenantService } from '../services/master-tenant.service';

/**
 * Redireciona MASTER para /dashboard-master quando não tem tenant selecionado.
 * Quando MASTER tem tenant selecionado, permite acesso ao dashboard do tenant.
 */
export const adminDashboardGuard: CanMatchFn = () => {
  const auth         = inject(AuthService);
  const masterTenant = inject(MasterTenantService);
  const router       = inject(Router);

  const resolve = (): boolean | ReturnType<Router['parseUrl']> => {
    if (!auth.isMaster()) return true;                  // ADMIN → libera
    if (masterTenant.temTenant()) return true;          // MASTER com tenant → libera
    return router.parseUrl('/dashboard-master');         // MASTER sem tenant → redireciona
  };

  if (!auth.loading()) return resolve();

  return toObservable(auth.loading).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => resolve()),
  );
};
