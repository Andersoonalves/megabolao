import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { CodigoPermissao } from '@nossobolao/shared-types';
import { AuthService } from '../../services/auth.service';
import { ShellService } from '../../services/shell.service';
import { PwaBannerAdminComponent } from '../../../shared/components/pwa-banner/pwa-banner-admin.component';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle.component';

interface NavItem {
  section?: string;
  id?: string;
  label?: string;
  icon?: string;
  route?: string;
  /** Se presente, exibe o item somente quando o usuário tiver QUALQUER uma das permissões. */
  permissoes?: CodigoPermissao[];
}

const ADMIN_NAV: NavItem[] = [
  { section: 'Bolões' },
  { id: 'dashboard',  label: 'Dashboard',   icon: '◈', route: '/dashboard' },
  { id: 'boloes',     label: 'Meus bolões', icon: '🎲', route: '/boloes', permissoes: ['bolao.ler'] },
  { id: 'participantes', label: 'Participantes',  icon: '👥', route: '/participantes', permissoes: ['participante.ler'] },
  { id: 'sorteio',       label: 'Sorteios',       icon: '✦', route: '/sorteios', permissoes: ['sorteio.ler'] },
  { id: 'premios',       label: 'Prêmios',        icon: '🏆', route: '/bolao/0/premios', permissoes: ['premio.ler'] },
  { section: 'Comunicação' },
  { id: 'whatsapp',   label: 'WhatsApp',     icon: '💬', route: '/whatsapp', permissoes: ['whatsapp.ler'] },
  { section: 'Sistema' },
  { id: 'relatorios', label: 'Relatórios',   icon: '📄', route: '/relatorios', permissoes: ['relatorio.gerar'] },
  { id: 'usuarios',   label: 'Usuários',     icon: '👤', route: '/usuarios',   permissoes: ['usuario.ler'] },
  { id: 'perfis',     label: 'Perfis',       icon: '🛡', route: '/perfis',     permissoes: ['perfil.ler'] },
  { id: 'auditoria',  label: 'Auditoria',    icon: '📋', route: '/auditoria',  permissoes: ['auditoria.ler'] },
];

const MASTER_NAV: NavItem[] = [
  { section: 'Plataforma' },
  { id: 'master-dashboard', label: 'Visão geral', icon: '◈', route: '/dashboard-master' },
  { id: 'tenants',          label: 'Tenants',      icon: '🏢', route: '/tenants' },
  { section: 'Sistema' },
  { id: 'relatorios',       label: 'Relatórios',   icon: '📄', route: '/relatorios' },
  { id: 'auditoria',        label: 'Auditoria',    icon: '📋', route: '/auditoria' },
];

@Component({
  selector: 'nb-admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, PwaBannerAdminComponent, ThemeToggleComponent],
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
                aria-label="Abrir menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div class="flex items-center gap-2 flex-1">
          <div class="w-7 h-7 rounded-[8px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-xs">NB</div>
          <span class="font-display font-semibold text-[15px]">NossoBolão</span>
        </div>
        <nb-theme-toggle [size]="'sm'" />
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
              <span class="font-display font-semibold text-[15.5px]">NossoBolão</span>
            </div>
            <div class="flex items-center gap-1">
              <nb-theme-toggle [size]="'sm'" />
              <button (click)="shell.closeDrawer()"
                      class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-lg"
                      aria-label="Fechar menu">
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
          <div class="font-display font-semibold text-[15.5px] tracking-tight">NossoBolão</div>
          <div class="text-[10.5px] text-slate-400 font-medium -mt-0.5">{{ auth.isMaster() ? 'Plataforma' : 'Admin' }}</div>
        </div>
        <nb-theme-toggle [size]="'sm'" />
      </div>

      <!-- Nav links -->
      <nav class="flex flex-col gap-0.5 px-2 flex-1 pt-2 lg:pt-0">
        @for (item of navItems(); track item.id ?? item.section) {
          @if (item.section) {
            <div class="text-[10.5px] font-semibold text-slate-400 uppercase tracking-widest px-2.5 pt-3.5 pb-1.5">{{ item.section }}</div>
          } @else {
            <a [routerLink]="item.route"
               routerLinkActive="bg-green-50 text-green-800 font-semibold"
               [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/dashboard-master' }"
               (click)="shell.closeDrawer()"
               class="flex items-center gap-2.5 px-2.5 py-3 lg:py-2 rounded-md text-slate-500 text-[13px] font-medium hover:bg-slate-100 hover:text-slate-900 transition-all duration-100 no-underline">
              <span class="text-base leading-none w-4 text-center flex-shrink-0">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        }
      </nav>

      <!-- User footer -->
      <div class="p-3 mt-auto">
        <div class="flex items-center gap-2.5 p-2 rounded-[10px] bg-slate-50 border border-slate-200">
          <div class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-xs flex-shrink-0">
            {{ initials() }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[12.5px] font-semibold truncate">{{ auth.user()?.email }}</div>
            <div class="text-[11px] text-slate-400">{{ auth.user()?.role }}</div>
          </div>
          <button (click)="auth.signOut()" class="text-slate-400 hover:text-slate-700 p-1 transition-colors" title="Sair">⏏</button>
        </div>
      </div>
    </ng-template>
  `,
})
export class AdminShellComponent {
  readonly auth  = inject(AuthService);
  readonly shell = inject(ShellService);

  /**
   * Lista de itens visíveis. Aplica gating por permissão e remove
   * cabeçalhos de seção que ficaram vazios após o filtro.
   */
  readonly navItems = computed<NavItem[]>(() => {
    // Reage a mudanças de usuário/permissões
    this.auth.user();

    const base = this.auth.isMaster() ? MASTER_NAV : ADMIN_NAV;
    const visiveis: NavItem[] = [];
    for (const item of base) {
      if (item.section) {
        visiveis.push(item);
        continue;
      }
      if (item.permissoes && !this.auth.temAlgumaPermissao(item.permissoes)) continue;
      visiveis.push(item);
    }
    // Remove seções vazias (a próxima entrada também é uma seção ou fim da lista)
    return visiveis.filter((item, idx) => {
      if (!item.section) return true;
      const next = visiveis[idx + 1];
      return !!next && !next.section;
    });
  });

  initials() {
    return (this.auth.user()?.email ?? '').slice(0, 2).toUpperCase();
  }
}
