import { Route } from '@angular/router';

export const portalRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./portal-busca/portal-busca.component').then(m => m.PortalBuscaComponent),
  },
  {
    path: 'detalhe',
    loadComponent: () => import('./portal-detalhe/portal-detalhe.component').then(m => m.PortalDetalheComponent),
  },
];
