import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ModuloComPermissoes } from '@nossobolao/shared-types';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class PermissaoService {
  private readonly api = inject(ApiService);

  /** Catálogo global de módulos com suas permissões. */
  catalogo(): Observable<ModuloComPermissoes[]> {
    return this.api.get<ModuloComPermissoes[]>('/permissoes/catalogo');
  }
}
