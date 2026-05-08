import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'portal',
    loadChildren: () => import('./features/portal/portal.routes').then(m => m.portalRoutes),
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/admin-shell/admin-shell.component').then(m => m.AdminShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard-admin/dashboard-admin.component').then(m => m.DashboardAdminComponent),
      },
      {
        path: 'dashboard-master',
        loadComponent: () => import('./features/dashboard/dashboard-master/dashboard-master.component').then(m => m.DashboardMasterComponent),
      },
      {
        path: 'bolao/novo',
        loadComponent: () => import('./features/bolao/criar-bolao/criar-bolao.component').then(m => m.CriarBolaoComponent),
      },
      {
        path: 'bolao/:id/cotas',
        loadComponent: () => import('./features/cotas/gestao-cotas/gestao-cotas.component').then(m => m.GestaoCotagsComponent),
      },
      {
        path: 'bolao/:id/sorteio',
        loadComponent: () => import('./features/sorteio/registrar-sorteio/registrar-sorteio.component').then(m => m.RegistrarSorteioComponent),
      },
      {
        path: 'bolao/:id/premios',
        loadComponent: () => import('./features/premios/premios-bolao/premios-bolao.component').then(m => m.PremiosBolaoComponent),
      },
      {
        path: 'whatsapp',
        loadComponent: () => import('./features/whatsapp/whatsapp/whatsapp.component').then(m => m.WhatsAppComponent),
      },
      {
        path: 'relatorios',
        loadComponent: () => import('./features/relatorios/relatorios/relatorios.component').then(m => m.RelatoriosComponent),
      },
      {
        path: 'tenants',
        loadComponent: () => import('./features/master/tenants/tenants.component').then(m => m.TenantsComponent),
      },
      {
        path: 'tenants/novo',
        loadComponent: () => import('./features/master/novo-tenant/novo-tenant.component').then(m => m.NovoTenantComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
