import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const masterGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.loading).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => {
      if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
      return auth.isMaster() || router.createUrlTree(['/dashboard']);
    }),
  );
};
