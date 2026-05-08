import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass } from '@angular/common';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  section?: string;
  id?: string;
  label?: string;
  icon?: string;
  route?: string;
}

const ADMIN_NAV: NavItem[] = [
  { section: 'Bolões' },
  { id: 'dashboard',  label: 'Dashboard',     icon: '◈', route: '/dashboard' },
  { id: 'bolao-novo', label: 'Criar bolão',    icon: '+', route: '/bolao/novo' },
  { id: 'sorteio',    label: 'Sorteios',       icon: '✦', route: '/bolao/0/sorteio' },
  { id: 'premios',    label: 'Prêmios',        icon: '🏆', route: '/bolao/0/premios' },
  { section: 'Comunicação' },
  { id: 'whatsapp',   label: 'WhatsApp',       icon: '💬', route: '/whatsapp' },
  { section: 'Sistema' },
  { id: 'relatorios', label: 'Relatórios',     icon: '📄', route: '/relatorios' },
];

const MASTER_NAV: NavItem[] = [
  { section: 'Plataforma' },
  { id: 'master-dashboard', label: 'Visão geral', icon: '◈', route: '/dashboard-master' },
  { id: 'tenants',          label: 'Tenants',      icon: '🏢', route: '/tenants' },
  { section: 'Sistema' },
  { id: 'relatorios',       label: 'Relatórios',   icon: '📄', route: '/relatorios' },
];

@Component({
  selector: 'nb-admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgClass],
  template: `
    <!-- Mobile: sidebar overlay trigger -->
    <div class="grid min-h-screen" style="grid-template-columns: 240px 1fr">

      <!-- Sidebar -->
      <aside class="bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 overflow-y-auto">
        <!-- Logo -->
        <div class="flex items-center gap-2.5 px-3 pt-4 pb-5">
          <div class="w-8 h-8 rounded-[9px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-sm tracking-tight shadow-sm">NB</div>
          <div>
            <div class="font-display font-semibold text-[15.5px] tracking-tight">NossoBolão</div>
            <div class="text-[10.5px] text-slate-400 font-medium -mt-0.5">{{ auth.isMaster() ? 'Plataforma' : 'Admin' }}</div>
          </div>
        </div>

        <!-- Nav links -->
        <nav class="flex flex-col gap-0.5 px-2 flex-1">
          @for (item of navItems(); track item.id ?? item.section) {
            @if (item.section) {
              <div class="text-[10.5px] font-semibold text-slate-400 uppercase tracking-widest px-2.5 pt-3.5 pb-1.5">{{ item.section }}</div>
            } @else {
              <a [routerLink]="item.route"
                 routerLinkActive="bg-green-50 text-green-800 font-semibold"
                 [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/dashboard-master' }"
                 class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-slate-500 text-[13px] font-medium hover:bg-slate-100 hover:text-slate-900 transition-all duration-100 no-underline">
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
      </aside>

      <!-- Main content -->
      <div class="flex flex-col min-w-0">
        <router-outlet />
      </div>
    </div>
  `,
})
export class AdminShellComponent {
  readonly auth: AuthService;

  constructor(auth: AuthService) {
    this.auth = auth;
  }

  navItems() {
    return this.auth.isMaster() ? MASTER_NAV : ADMIN_NAV;
  }

  initials() {
    const email = this.auth.user()?.email ?? '';
    return email.slice(0, 2).toUpperCase();
  }
}
