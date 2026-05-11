import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService, AppLang } from '../../../core/services/i18n.service';
import { PwaBannerPortalComponent } from '../../../shared/components/pwa-banner/pwa-banner-portal.component';
import { PortalApiService } from '../portal-api.service';

const NAV_ITEMS = [
  { id: 'cotas',   labelKey: 'portal.nav.pools',  icon: '🏠', route: '/portal/cotas' },
  { id: 'premios', labelKey: 'portal.nav.prizes', icon: '🏆', route: '/portal/premios' },
];

@Component({
  selector: 'nb-portal-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, PwaBannerPortalComponent],
  template: `
    <div class="min-h-screen bg-slate-50 relative">

      <!-- Mobile: barra superior — Olá + menu (idioma + sair) -->
      <div
        class="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm"
        style="padding-top: max(0.5rem, env(safe-area-inset-top, 0px))"
      >
        <div class="px-3 py-2 flex items-center gap-2.5 min-h-14">
          <div
            class="w-9 h-9 shrink-0 rounded-[10px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-xs tracking-tight"
          >
            NB
          </div>
          <div class="flex-1 min-w-0 relative" data-portal-user-menu-root>
            <button
              type="button"
              class="flex items-center gap-2 w-full min-h-12 px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-left hover:bg-slate-100 transition-colors"
              (click)="toggleUserMenu($event)"
              [attr.aria-expanded]="userMenuOpen()"
              [attr.aria-label]="'shell.userMenu' | translate"
              aria-haspopup="true"
            >
              <div
                class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-[11px] flex-shrink-0"
              >
                {{ initials() }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-[10.5px] text-slate-500 leading-tight">{{ 'portalCotas.hello' | translate }}</div>
                <div class="text-[13px] font-semibold text-slate-900 truncate">{{ displayName() }}</div>
              </div>
              <span
                class="text-slate-400 text-[10px] shrink-0 transition-transform"
                [class.rotate-180]="userMenuOpen()"
                >▼</span
              >
            </button>
            @if (userMenuOpen()) {
              <div
                role="menu"
                class="absolute left-0 right-0 top-full mt-1.5 py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-[80]"
              >
                <div
                  class="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100"
                >
                  {{ 'shell.language' | translate }}
                </div>
                <div class="flex gap-1 p-2">
                  <button type="button" role="menuitem" (click)="setLang('pt')" [class]="langBtnClass('pt')">PT</button>
                  <button type="button" role="menuitem" (click)="setLang('en')" [class]="langBtnClass('en')">EN</button>
                </div>
                <div class="border-t border-slate-100 mt-0.5 pt-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    (click)="onSignOut()"
                    class="w-full text-left px-3 py-2.5 text-[13px] font-semibold text-red-700 hover:bg-red-50 rounded-lg transition-colors min-h-10"
                  >
                    {{ 'shell.signOut' | translate }}
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Desktop: sidebar 240px | Main. Mobile: sem sidebar (usa bottom nav) -->
      <div class="lg:grid" style="grid-template-columns: 240px 1fr">
        <!-- ── Sidebar (desktop) ───────────────────────────────────────────── -->
        <aside
          class="hidden lg:flex flex-col bg-white border-r border-slate-200 h-screen sticky top-0 overflow-y-auto"
        >
          <div class="px-4 pt-4 pb-3 border-b border-slate-200">
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-[9px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-sm tracking-tight shadow-sm"
              >
                NB
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-display font-semibold text-[15.5px] tracking-tight">{{ 'app.name' | translate }}</div>
                <div class="text-[10.5px] text-slate-400 font-medium -mt-0.5">{{ 'shell.platform' | translate }}</div>
              </div>
            </div>
          </div>

          <nav class="flex flex-col gap-0.5 px-2 py-2 flex-1">
            @for (item of navItems; track item.id) {
              <a
                [routerLink]="item.route"
                routerLinkActive="bg-green-50 text-green-800 font-semibold border-l-[3px] border-green-700 shadow-sm"
                [routerLinkActiveOptions]="{ exact: true }"
                class="w-full flex items-center gap-2.5 px-3 py-3 rounded-md text-slate-600 text-[13px] font-medium border-l-[3px] border-transparent hover:bg-slate-100 hover:text-slate-900 transition-colors no-underline"
              >
                <span class="text-base leading-none w-5 text-center flex-shrink-0">{{ item.icon }}</span>
                <span class="truncate">{{ item.labelKey | translate }}</span>
              </a>
            }
          </nav>

          <!-- Conta: idioma + sair -->
          <div class="p-3 border-t border-slate-100 relative mt-auto" data-portal-user-menu-root>
            <button
              type="button"
              class="flex items-center gap-2.5 p-2 rounded-[10px] bg-slate-50 border border-slate-200 w-full text-left hover:bg-slate-100 transition-colors min-h-12"
              (click)="toggleUserMenu($event)"
              [attr.aria-expanded]="userMenuOpen()"
              [attr.aria-label]="'shell.userMenu' | translate"
              aria-haspopup="true"
            >
              <div
                class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-[11px] flex-shrink-0"
              >
                {{ initials() }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-[10.5px] text-slate-500 leading-tight">{{ 'portalCotas.hello' | translate }}</div>
                <div class="text-[12.5px] font-semibold text-slate-900 truncate">{{ displayName() }}</div>
              </div>
              <span
                class="text-slate-400 text-[10px] shrink-0 transition-transform"
                [class.rotate-180]="userMenuOpen()"
                >▼</span
              >
            </button>
            @if (userMenuOpen()) {
              <div
                role="menu"
                class="absolute bottom-full left-2 right-2 mb-1.5 py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-[80]"
              >
                <div
                  class="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100"
                >
                  {{ 'shell.language' | translate }}
                </div>
                <div class="flex gap-1 p-2">
                  <button type="button" role="menuitem" (click)="setLang('pt')" [class]="langBtnClass('pt')">PT</button>
                  <button type="button" role="menuitem" (click)="setLang('en')" [class]="langBtnClass('en')">EN</button>
                </div>
                <div class="border-t border-slate-100 mt-0.5 pt-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    (click)="onSignOut()"
                    class="w-full text-left px-3 py-2.5 text-[13px] font-semibold text-red-700 hover:bg-red-50 rounded-lg transition-colors min-h-10"
                  >
                    {{ 'shell.signOut' | translate }}
                  </button>
                </div>
              </div>
            }
          </div>
        </aside>

        <!-- ── Main content ────────────────────────────────────────────────── -->
        <div class="flex flex-col min-w-0">
          <div class="flex-1 overflow-y-auto pb-[60px] lg:pb-0">
            <router-outlet />
          </div>
          <nb-pwa-banner-portal />
        </div>
      </div>

      <!-- Bottom nav — mobile -->
      <nav
        class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 lg:hidden"
        style="height: 60px; padding-bottom: env(safe-area-inset-bottom, 0px)"
      >
        <div class="flex h-full items-stretch gap-0.5 px-1 pt-0.5">
          @for (item of navItems; track item.id) {
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-green-50 text-green-800 font-semibold shadow-[inset_0_3px_0_0_#166534]"
              [routerLinkActiveOptions]="{ exact: true }"
              class="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 no-underline transition-colors min-h-0 rounded-t-xl hover:bg-slate-50 hover:text-slate-700"
            >
              <span class="text-xl leading-none">{{ item.icon }}</span>
              <span class="text-[10.5px] font-medium">{{ item.labelKey | translate }}</span>
            </a>
          }
        </div>
      </nav>
    </div>
  `,
})
export class PortalShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly navItems = NAV_ITEMS;
  private readonly portalApi = inject(PortalApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly i18n = inject(I18nService);

  readonly userMenuOpen = signal(false);
  private readonly participantFirstName = signal<string>('');

  displayName(): string {
    const p = this.participantFirstName();
    if (p) return p;
    const cel = this.portalApi.storedPortalCelular();
    if (cel) return cel;
    return this.translate.instant('portalCotas.participantFallback');
  }

  ngOnInit(): void {
    void this.loadParticipantLabel();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.userMenuOpen()) return;
    const t = ev.target;
    if (t instanceof Element && t.closest('[data-portal-user-menu-root]')) return;
    this.userMenuOpen.set(false);
  }

  toggleUserMenu(ev: Event): void {
    ev.stopPropagation();
    this.userMenuOpen.update(v => !v);
  }

  langBtnClass(code: AppLang): string {
    const on = this.i18n.lang() === code;
    const base = 'flex-1 min-h-10 px-2 text-xs font-bold rounded-lg border transition-colors';
    return on
      ? `${base} bg-green-700 text-white border-green-700`
      : `${base} bg-white text-slate-600 border-slate-200 hover:bg-slate-50`;
  }

  async setLang(code: AppLang): Promise<void> {
    await this.i18n.setLang(code);
    this.userMenuOpen.set(false);
  }

  onSignOut(): void {
    this.userMenuOpen.set(false);
    this.portalApi.clearLogin();
    void this.router.navigate(['/portal/login']);
  }

  initials(): string {
    const name = this.participantFirstName();
    if (name.length >= 2) return name.slice(0, 2).toUpperCase();
    const cel = this.portalApi.storedPortalCelular();
    if (cel && cel.length >= 2) return cel.slice(-2);
    const email = this.auth.user()?.email;
    if (email && email.length >= 2) return email.slice(0, 2).toUpperCase();
    return 'NB';
  }

  private async loadParticipantLabel(): Promise<void> {
    try {
      const resumo = await this.portalApi.resumo();
      const full = resumo.participante.nome.trim();
      const first = full.split(/\s+/)[0] ?? full;
      this.participantFirstName.set(first || resumo.participante.celular);
    } catch {
      this.participantFirstName.set('');
    }
  }
}
