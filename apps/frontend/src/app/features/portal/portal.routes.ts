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
      {
        path: 'ranking',
        loadComponent: () => import('./portal-ranking/portal-ranking.component').then(m => m.PortalRankingComponent),
      },
    ],
  },
  // Redirect raiz /portal → login
  { path: '**', redirectTo: 'login' },
];
