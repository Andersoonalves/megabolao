import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { PwaBannerPortalComponent } from '../../../shared/components/pwa-banner/pwa-banner-portal.component';
import { LangToggleComponent } from '../../../shared/components/lang-toggle/lang-toggle.component';

const NAV_ITEMS = [
  { id: 'cotas',    labelKey: 'portal.nav.pools',   icon: '🏠', route: '/portal/cotas'   },
  { id: 'ranking',  labelKey: 'portal.nav.ranking', icon: '📊', route: '/portal/ranking' },
  { id: 'palpites', labelKey: 'portal.nav.picks',   icon: '🎫', route: '/portal/cotas'   },
  { id: 'premios',  labelKey: 'portal.nav.prizes',  icon: '🏆', route: '/portal/cotas'   },
];

@Component({
  selector: 'nb-portal-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, PwaBannerPortalComponent, LangToggleComponent],
  template: `
    <div class="min-h-screen bg-slate-50 flex flex-col relative">

      <!-- Idioma fixo (sempre visível no portal) -->
      <div class="fixed top-3 right-3 z-[90] max-w-[calc(100vw-1rem)]">
        <nb-lang-toggle [prominent]="true" />
      </div>

      <!-- Conteúdo das rotas filhas -->
      <div class="flex-1 overflow-y-auto pb-[60px] lg:pb-0">
        <router-outlet />
      </div>

      <!-- Banner PWA portal — acima do bottom nav (CLAUDE.md: bottom: 60px + safe-area) -->
      <nb-pwa-banner-portal />

      <!-- Bottom nav — mobile (lg: oculto) ───────────────────────────────── -->
      <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 lg:hidden"
           style="height: 60px; padding-bottom: env(safe-area-inset-bottom, 0px)">
        <div class="flex h-full">
          @for (item of navItems; track item.id) {
            <a [routerLink]="item.route"
               routerLinkActive="text-green-700"
               class="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-400 no-underline transition-colors min-h-[60px]"
               [routerLinkActiveOptions]="{ exact: false }">
              <span class="text-xl leading-none">{{ item.icon }}</span>
              <span class="text-[10.5px] font-medium">{{ item.labelKey | translate }}</span>
            </a>
          }
        </div>
      </nav>
    </div>
  `,
})
export class PortalShellComponent {
  readonly auth     = inject(AuthService);
  readonly navItems = NAV_ITEMS;
}
