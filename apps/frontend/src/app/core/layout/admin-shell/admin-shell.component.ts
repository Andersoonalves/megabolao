import {
  Component, ChangeDetectionStrategy, computed, inject, signal,
  HostListener,
} from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { CodigoPermissao } from '@nossobolao/shared-types';
import { AuthService } from '../../services/auth.service';
import { ShellService } from '../../services/shell.service';
import { MasterTenantService } from '../../services/master-tenant.service';
import { PwaBannerAdminComponent } from '../../../shared/components/pwa-banner/pwa-banner-admin.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';
import { TenantSelectorComponent } from '../../../shared/components/tenant-selector/tenant-selector.component';
import { I18nService, AppLang } from '../../services/i18n.service';

interface NavItem {
  /** Chave i18n da seção (ex.: `nav.section.lotteries`). */
  sectionKey?: string;
  id?: string;
  /** Chave i18n do rótulo do link (ex.: `nav.dashboard`). */
  labelKey?: string;
  icon?: string;
  route?: string;
  /** Se presente, exibe o item somente quando o usuário tiver QUALQUER uma das permissões. */
  permissoes?: CodigoPermissao[];
  /** Subitens (ex.: WhatsApp → envio em etapas). `icon` opcional nos filhos. */
  children?: NavItem[];
}

const ADMIN_NAV: NavItem[] = [
  { sectionKey: 'nav.section.lotteries' },
  { id: 'dashboard',  labelKey: 'nav.dashboard',   icon: '◈', route: '/dashboard' },
  { id: 'boloes',     labelKey: 'nav.myPools',     icon: '🎲', route: '/boloes', permissoes: ['bolao.ler'] },
  { id: 'participantes', labelKey: 'nav.participants', icon: '👥', route: '/participantes', permissoes: ['participante.ler'] },
  { id: 'sorteio',       labelKey: 'nav.draws',       icon: '✦', route: '/sorteios', permissoes: ['sorteio.ler'] },
  // { id: 'premios',       labelKey: 'nav.prizes',      icon: '🏆', route: '/bolao/0/premios', permissoes: ['premio.ler'] },
  { sectionKey: 'nav.section.communication' },
  {
    id: 'whatsapp',
    labelKey: 'nav.whatsapp',
    icon: '💬',
    route: '/whatsapp',
    permissoes: ['whatsapp.ler'],
    children: [
      {
        id: 'whatsapp-envio-etapas',
        labelKey: 'nav.whatsappSendSteps',
        route: '/whatsapp/envio-etapas',
        permissoes: ['whatsapp.ler'],
      },
    ],
  },
  { sectionKey: 'nav.section.system' },
  { id: 'relatorios', labelKey: 'nav.reports',   icon: '📄', route: '/relatorios', permissoes: ['relatorio.gerar'] },
  { id: 'usuarios',   labelKey: 'nav.users',     icon: '👤', route: '/usuarios',   permissoes: ['usuario.ler'] },
  { id: 'perfis',     labelKey: 'nav.profiles',  icon: '🛡', route: '/perfis',     permissoes: ['perfil.ler'] },
  { id: 'auditoria',  labelKey: 'nav.audit',     icon: '📋', route: '/auditoria',  permissoes: ['auditoria.ler'] },
];

// Nav do MASTER sem tenant selecionado — só telas de plataforma
const MASTER_NAV: NavItem[] = [
  { sectionKey: 'nav.section.platform' },
  { id: 'master-dashboard', labelKey: 'nav.overview', icon: '◈', route: '/dashboard-master' },
  { id: 'tenants',          labelKey: 'nav.tenants',  icon: '🏢', route: '/tenants' },
  { sectionKey: 'nav.section.system' },
  { id: 'relatorios',       labelKey: 'nav.reports',   icon: '📄', route: '/relatorios' },
  { id: 'auditoria',        labelKey: 'nav.audit',     icon: '📋', route: '/auditoria' },
];

// Nav do MASTER com tenant selecionado — plataforma + todas as telas admin
const MASTER_COM_TENANT_NAV: NavItem[] = [
  { sectionKey: 'nav.section.platform' },
  { id: 'master-dashboard', labelKey: 'nav.overview', icon: '◈', route: '/dashboard-master' },
  { id: 'tenants',          labelKey: 'nav.tenants',  icon: '🏢', route: '/tenants' },
  ...ADMIN_NAV,
];

@Component({
  selector: 'nb-admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, TranslatePipe,
    PwaBannerAdminComponent, ThemeToggleComponent, TenantSelectorComponent,
  ],
  template: `
    <!-- Desktop: sidebar 240px | Main. Mobile: sidebar oculta, drawer -->
    <nb-pwa-banner-admin />
    <div class="min-h-screen lg:grid" style="grid-template-columns: 240px 1fr">

      <!-- ── Sidebar (desktop sempre visível) ────────────────────────────────── -->
      <aside class="hidden lg:flex flex-col bg-white border-r border-slate-200 h-screen sticky top-0 overflow-y-auto">
        <ng-container *ngTemplateOutlet="sidebarContent" />
      </aside>

      <!-- ── Mobile header com hambúrguer ────────────────────────────────────── -->
      <!-- h-14=56px fixo → page topbars usam sticky top-14 no mobile -->
      <div class="lg:hidden bg-white border-b border-slate-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-30">
        <button (click)="shell.openDrawer()"
                class="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                [attr.aria-label]="'shell.openMenu' | translate">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div class="flex items-center gap-2 flex-1">
          <div class="w-7 h-7 rounded-[8px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-xs">NB</div>
          <span class="font-display font-semibold text-[15px]">{{ 'app.name' | translate }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <nb-theme-toggle [size]="'sm'" />
        </div>
      </div>

      <!-- ── Mobile drawer (backdrop + painel) ───────────────────────────────── -->
      @if (shell.drawerOpen()) {
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/40 z-40 lg:hidden"
             (click)="shell.closeDrawer()"></div>

        <!-- Drawer -->
        <aside class="fixed left-0 top-0 h-full w-64 bg-white z-50 lg:hidden flex flex-col shadow-xl overflow-y-auto">
          <div class="flex items-center justify-between px-4 pt-4 pb-2">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-[9px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-sm">NB</div>
              <span class="font-display font-semibold text-[15.5px]">{{ 'app.name' | translate }}</span>
            </div>
            <div class="flex items-center gap-1">
              <nb-theme-toggle [size]="'sm'" />
              <button (click)="shell.closeDrawer()"
                      class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-lg"
                      [attr.aria-label]="'shell.closeMenu' | translate">
                ✕
              </button>
            </div>
          </div>
          <ng-container *ngTemplateOutlet="sidebarContent" />
        </aside>
      }

      <!-- ── Main content ─────────────────────────────────────────────────────── -->
      <div class="flex flex-col min-w-0">
        <router-outlet />
      </div>
    </div>

    <!-- ── Sidebar content template ─────────────────────────────────────────── -->
    <ng-template #sidebarContent>
      <!-- Logo (desktop only — mobile has it in the header) -->
      <div class="hidden lg:flex items-center gap-2.5 px-3 pt-4 pb-5">
        <div class="w-8 h-8 rounded-[9px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-sm tracking-tight shadow-sm">NB</div>
        <div class="flex-1 min-w-0">
          <div class="font-display font-semibold text-[15.5px] tracking-tight">{{ 'app.name' | translate }}</div>
          <div class="text-[10.5px] text-slate-400 font-medium -mt-0.5">
            {{ (auth.isMaster() ? 'shell.platform' : 'shell.admin') | translate }}
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <nb-theme-toggle [size]="'sm'" />
        </div>
      </div>

      <!-- Seletor de tenant (só MASTER) -->
      @if (auth.isMaster()) {
        <nb-tenant-selector />
      }

      <!-- Nav links -->
      <nav class="flex flex-col gap-0.5 px-2 flex-1 pt-2 lg:pt-0">
        @for (item of navItems(); track item.sectionKey ?? item.id ?? $index) {
          @if (item.sectionKey) {
            <div class="text-[10.5px] font-semibold text-slate-400 uppercase tracking-widest px-2.5 pt-3.5 pb-1.5">{{ item.sectionKey | translate }}</div>
          } @else if (item.children?.length) {
            <div class="flex flex-col gap-0.5">
              <a [routerLink]="item.route"
                 routerLinkActive="bg-green-50 text-green-800 font-semibold"
                 [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/dashboard-master' || item.route === '/whatsapp' }"
                 (click)="shell.closeDrawer()"
                 class="flex items-center gap-2.5 px-2.5 py-3 lg:py-2 rounded-md text-slate-500 text-[13px] font-medium hover:bg-slate-100 hover:text-slate-900 transition-all duration-100 no-underline">
                <span class="text-base leading-none w-4 text-center flex-shrink-0">{{ item.icon }}</span>
                <span>{{ item.labelKey! | translate }}</span>
              </a>
              @for (sub of item.children; track sub.id) {
                <a [routerLink]="sub.route"
                   routerLinkActive="bg-green-50 text-green-800 font-semibold"
                   (click)="shell.closeDrawer()"
                   class="flex items-center gap-2 pl-8 pr-2.5 py-2.5 lg:py-2 rounded-md text-slate-500 text-[12.5px] font-medium hover:bg-slate-100 hover:text-slate-900 transition-all duration-100 no-underline">
                  <span class="truncate">{{ sub.labelKey! | translate }}</span>
                </a>
              }
            </div>
          } @else {
            <a [routerLink]="item.route"
               routerLinkActive="bg-green-50 text-green-800 font-semibold"
               [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/dashboard-master' }"
               (click)="shell.closeDrawer()"
               class="flex items-center gap-2.5 px-2.5 py-3 lg:py-2 rounded-md text-slate-500 text-[13px] font-medium hover:bg-slate-100 hover:text-slate-900 transition-all duration-100 no-underline">
              <span class="text-base leading-none w-4 text-center flex-shrink-0">{{ item.icon }}</span>
              <span>{{ item.labelKey! | translate }}</span>
            </a>
          }
        }
      </nav>

      <!-- User footer: abre menu (idioma + sair) -->
      <div class="p-3 mt-auto relative" data-admin-user-menu-root>
        <button type="button"
                class="flex items-center gap-2.5 p-2 rounded-[10px] bg-slate-50 border border-slate-200 w-full text-left hover:bg-slate-100 transition-colors min-h-12"
                (click)="toggleUserMenu($event)"
                [attr.aria-expanded]="userMenuOpen()"
                [attr.aria-label]="'shell.userMenu' | translate"
                aria-haspopup="true">
          <div class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-xs flex-shrink-0">
            {{ initials() }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[12.5px] font-semibold truncate">{{ auth.user()?.email }}</div>
            <div class="text-[11px] text-slate-400">{{ auth.user()?.role }}</div>
          </div>
          <span class="text-slate-400 text-[10px] shrink-0 transition-transform"
                [class.rotate-180]="userMenuOpen()">▼</span>
        </button>
        @if (userMenuOpen()) {
          <div id="admin-user-menu"
               role="menu"
               class="absolute bottom-full left-2 right-2 mb-1.5 py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-[80]">
            <div class="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
              {{ 'shell.language' | translate }}
            </div>
            <div class="flex gap-1 p-2">
              <button type="button" role="menuitem"
                      (click)="setLang('pt')"
                      [class]="langBtnClass('pt')">
                PT
              </button>
              <button type="button" role="menuitem"
                      (click)="setLang('en')"
                      [class]="langBtnClass('en')">
                EN
              </button>
            </div>
            <div class="border-t border-slate-100 mt-0.5 pt-0.5">
              <button type="button" role="menuitem"
                      (click)="onSignOut()"
                      class="w-full text-left px-3 py-2.5 text-[13px] font-semibold text-red-700 hover:bg-red-50 rounded-lg transition-colors min-h-10">
                {{ 'shell.signOut' | translate }}
              </button>
            </div>
          </div>
        }
      </div>
    </ng-template>
  `,
})
export class AdminShellComponent {
  readonly auth         = inject(AuthService);
  readonly shell        = inject(ShellService);
  readonly masterTenant = inject(MasterTenantService);
  readonly i18n         = inject(I18nService);

  /** Menu conta (idioma + sair) aberto a partir do e-mail na sidebar. */
  readonly userMenuOpen = signal(false);

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.userMenuOpen()) return;
    const t = ev.target;
    if (t instanceof Element && t.closest('[data-admin-user-menu-root]')) return;
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
    this.shell.closeDrawer();
    void this.auth.signOut();
  }

  /**
   * Lista de itens visíveis. Aplica gating por permissão e remove
   * cabeçalhos de seção que ficaram vazios após o filtro.
   */
  readonly navItems = computed<NavItem[]>(() => {
    // Reage a mudanças de usuário/permissões
    this.auth.user();

    const base = this.auth.isMaster()
      ? (this.masterTenant.temTenant() ? MASTER_COM_TENANT_NAV : MASTER_NAV)
      : ADMIN_NAV;
    const visiveis: NavItem[] = [];
    for (const item of base) {
      if (item.sectionKey) {
        visiveis.push(item);
        continue;
      }
      if (item.children?.length) {
        if (item.permissoes && !this.auth.temAlgumaPermissao(item.permissoes)) continue;
        const children = item.children.filter(
          c => !c.permissoes || this.auth.temAlgumaPermissao(c.permissoes),
        );
        visiveis.push({ ...item, children });
        continue;
      }
      if (item.permissoes && !this.auth.temAlgumaPermissao(item.permissoes)) continue;
      visiveis.push(item);
    }
    // Remove seções vazias (a próxima entrada também é uma seção ou fim da lista)
    return visiveis.filter((item, idx) => {
      if (!item.sectionKey) return true;
      const next = visiveis[idx + 1];
      return !!next && !next.sectionKey;
    });
  });

  initials() {
    return (this.auth.user()?.email ?? '').slice(0, 2).toUpperCase();
  }
}
