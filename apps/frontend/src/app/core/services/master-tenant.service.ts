import { Injectable, signal, computed } from '@angular/core';

export interface TenantOption {
  id: string;
  nome: string;
  slug: string;
  status: string;
}

const STORAGE_KEY = 'master_selected_tenant';

@Injectable({ providedIn: 'root' })
export class MasterTenantService {
  private readonly _tenant = signal<TenantOption | null>(this.loadFromStorage());

  readonly tenant    = this._tenant.asReadonly();
  readonly tenantId  = computed(() => this._tenant()?.id ?? null);
  readonly temTenant = computed(() => this._tenant() !== null);

  select(t: TenantOption): void {
    this._tenant.set(t);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {}
  }

  clear(): void {
    this._tenant.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  private loadFromStorage(): TenantOption | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as TenantOption) : null;
    } catch { return null; }
  }
}
