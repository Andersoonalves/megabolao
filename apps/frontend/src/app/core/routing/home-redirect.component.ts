import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Rota raiz `/`: envia MASTER para a visão da plataforma e demais usuários
 * autenticados para o dashboard do tenant; visitantes vão para o login.
 */
@Component({
  selector: 'nb-home-redirect',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class HomeRedirectComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const go = (): void => {
      if (!this.auth.isAuthenticated()) {
        void this.router.navigate(['/login']);
        return;
      }
      if (this.auth.isMaster()) {
        void this.router.navigate(['/dashboard-master']);
        return;
      }
      void this.router.navigate(['/dashboard']);
    };

    if (!this.auth.loading()) {
      go();
      return;
    }

    toObservable(this.auth.loading)
      .pipe(
        filter((loading) => !loading),
        take(1),
        map(() => undefined),
      )
      .subscribe(() => go());
  }
}
