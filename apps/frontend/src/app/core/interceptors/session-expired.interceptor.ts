import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/** Rotas em que 401 não deve disparar fluxo de sessão expirada. */
function isAuthPage(url: string): boolean {
  return url.startsWith('/login') || url.startsWith('/portal/login');
}

export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const isApiCall = req.url.startsWith(environment.apiUrl);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse
        && err.status === 401
        && isApiCall
        && !isAuthPage(router.url)
        && (auth.getAccessToken() || auth.isAuthenticated())
      ) {
        void auth.handleSessionExpired();
      }
      return throwError(() => err);
    }),
  );
};
