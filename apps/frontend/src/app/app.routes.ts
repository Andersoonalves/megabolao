import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissaoGuard } from './core/guards/permissao.guard';
import { adminDashboardGuard } from './core/guards/admin-dashboard.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./core/routing/home-redirect.component').then(m => m.HomeRedirectComponent),
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
        canMatch: [adminDashboardGuard],
        loadComponent: () => import('./features/dashboard/dashboard-admin/dashboard-admin.component').then(m => m.DashboardAdminComponent),
      },
      {
        path: 'dashboard-master',
        loadComponent: () => import('./features/dashboard/dashboard-master/dashboard-master.component').then(m => m.DashboardMasterComponent),
      },
      {
        path: 'minha-conta',
        loadComponent: () => import('./features/minha-conta/minha-conta.component').then(m => m.MinhaContaComponent),
      },
      {
        path: 'boloes',
        loadComponent: () => import('./features/bolao/lista-bolaoes/lista-bolaoes.component').then(m => m.ListaBolaoesComponent),
      },
      {
        path: 'bolao/novo',
        loadComponent: () => import('./features/bolao/criar-bolao/criar-bolao.component').then(m => m.CriarBolaoComponent),
      },
      {
        path: 'bolao/:id/detalhes',
        loadComponent: () => import('./features/bolao/bolao-detalhes/bolao-detalhes.component').then(m => m.BolaoDetalhesComponent),
      },
      {
        path: 'bolao/:id/whatsapp',
        loadComponent: () => import('./features/bolao/bolao-whatsapp/bolao-whatsapp.component').then(m => m.BolaoWhatsappComponent),
      },
      {
        path: 'bolao/:id/google-drive',
        loadComponent: () => import('./features/google-drive/google-drive.component').then(m => m.GoogleDriveComponent),
      },
      {
        path: 'bolao/:id/cotas',
        loadComponent: () => import('./features/cotas/gestao-cotas/gestao-cotas.component').then(m => m.GestaoCotasComponent),
      },
      {
        path: 'sorteios',
        loadComponent: () => import('./features/sorteio/registrar-sorteio/registrar-sorteio.component').then(m => m.RegistrarSorteioComponent),
      },
      {
        path: 'participantes',
        loadComponent: () => import('./features/participantes/participantes.component').then(m => m.ParticipantesComponent),
      },
      {
        path: 'bolao/:id/premios',
        loadComponent: () => import('./features/premios/premios-bolao/premios-bolao.component').then(m => m.PremiosBolaoComponent),
      },
      {
        path: 'whatsapp/nova-mensagem',
        loadComponent: () =>
          import('./features/whatsapp/whatsapp-envio-mensagem/whatsapp-envio-mensagem.component').then(
            m => m.WhatsappEnvioMensagemComponent,
          ),
      },
      {
        path: 'whatsapp/envio-etapas',
        loadComponent: () =>
          import('./features/whatsapp/whatsapp-envio-etapas/whatsapp-envio-etapas.component').then(
            m => m.WhatsappEnvioEtapasComponent,
          ),
      },
      {
        path: 'whatsapp',
        loadComponent: () => import('./features/whatsapp/whatsapp/whatsapp.component').then(m => m.WhatsAppComponent),
      },
      {
        path: 'whatsapp/templates',
        loadComponent: () => import('./features/whatsapp/templates/wa-templates.component').then(m => m.WaTemplatesComponent),
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
      {
        path: 'perfis',
        canActivate: [permissaoGuard('perfil.ler')],
        loadComponent: () => import('./features/rbac/perfis/perfis.component').then(m => m.PerfisComponent),
      },
      {
        path: 'usuarios',
        canActivate: [permissaoGuard('usuario.ler')],
        loadComponent: () => import('./features/rbac/usuarios/usuarios.component').then(m => m.UsuariosComponent),
      },
      {
        path: 'auditoria',
        canActivate: [permissaoGuard('auditoria.ler')],
        loadComponent: () => import('./features/rbac/auditoria/auditoria.component').then(m => m.AuditoriaComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
