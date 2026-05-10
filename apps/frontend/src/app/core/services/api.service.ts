import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { MasterTenantService } from './master-tenant.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http         = inject(HttpClient);
  private readonly auth         = inject(AuthService);
  private readonly masterTenant = inject(MasterTenantService);

  private url(path: string): string {
    return `${environment.apiUrl}${path}`;
  }

  private tenantHeaders(): Record<string, string> {
    // MASTER usa o tenant selecionado manualmente; ADMIN usa o próprio tenantId do JWT
    const tenantId = this.auth.isMaster()
      ? this.masterTenant.tenantId()
      : this.auth.tenantId();
    return tenantId ? { 'X-Tenant-Id': tenantId } : {};
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(this.url(path), { headers: this.tenantHeaders() });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body, { headers: this.tenantHeaders() });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body, { headers: this.tenantHeaders() });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path), { headers: this.tenantHeaders() });
  }
}
