import { Route } from '@angular/router';

export const portalRoutes: Route[] = [
  // Login (público)
  {
    path: 'login',
    loadComponent: () => import('./portal-busca/portal-busca.component').then(m => m.PortalBuscaComponent),
  },
  // Shell autenticado com bottom nav
  {
    path: '',
    loadComponent: () => import('./portal-shell/portal-shell.component').then(m => m.PortalShellComponent),
    children: [
      { path: '',       redirectTo: 'cotas', pathMatch: 'full' },
      {
        path: 'cotas',
        loadComponent: () => import('./portal-cotas/portal-cotas.component').then(m => m.PortalCotasComponent),
      },
      { path: 'ranking', redirectTo: 'cotas', pathMatch: 'full' },
      { path: 'sorteios', redirectTo: 'cotas', pathMatch: 'full' },
      {
        path: 'premios',
        loadComponent: () => import('./portal-detalhe/portal-detalhe.component').then(m => m.PortalDetalheComponent),
      },
      {
        path: 'boloes/:bolaoId',
        loadComponent: () =>
          import('./portal-bolao-detalhe/portal-bolao-detalhe.component').then(m => m.PortalBolaoDetalheComponent),
      },
    ],
  },
  // Redirect raiz /portal → login
  { path: '**', redirectTo: 'login' },
];
