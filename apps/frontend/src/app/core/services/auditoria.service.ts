import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditoriaItem, AuditoriaSeveridade, PaginatedResponse } from '@nossobolao/shared-types';
import { ApiService } from './api.service';

export interface ListarAuditoriaQuery {
  page?: number;
  perPage?: number;
  acao?: string;
  recurso?: string;
  severidade?: AuditoriaSeveridade;
  userId?: string;
  desde?: string;
  ate?: string;
}

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly api = inject(ApiService);

  listar(query: ListarAuditoriaQuery = {}): Observable<PaginatedResponse<AuditoriaItem>> {
    const params = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const path = params ? `/auditoria?${params}` : '/auditoria';
    return this.api.get<PaginatedResponse<AuditoriaItem>>(path);
  }
}
