import {
  Component, signal, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { MasterTenantService, TenantOption } from '../../../core/services/master-tenant.service';

@Component({
  selector: 'nb-tenant-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="px-3 pb-3">
      <div class="rounded-[10px] border p-2.5 transition-colors"
           [class]="masterTenant.temTenant()
             ? 'border-green-300 bg-green-50'
             : 'border-slate-200 bg-slate-50'">

        <div class="text-[10px] font-bold uppercase tracking-widest mb-1.5"
             [class]="masterTenant.temTenant() ? 'text-green-700' : 'text-slate-400'">
          {{ masterTenant.temTenant() ? '👁 Visualizando tenant' : '🏢 Selecionar tenant' }}
        </div>

        @if (loading()) {
          <div class="h-7 bg-slate-200 rounded animate-pulse"></div>
        } @else {
          <select [ngModel]="masterTenant.tenantId()"
                  (ngModelChange)="onSelect($event)"
                  class="w-full text-[12.5px] font-semibold bg-transparent border-0 outline-none cursor-pointer py-0.5"
                  [class]="masterTenant.temTenant() ? 'text-green-800' : 'text-slate-500'">
            <option value="">— Nenhum (visão Master) —</option>
            @for (t of tenants(); track t.id) {
              <option [value]="t.id">{{ t.nome }}</option>
            }
          </select>
        }

        @if (masterTenant.temTenant()) {
          <div class="flex items-center justify-between mt-1.5">
            <span class="text-[10.5px] text-green-600 font-mono">{{ masterTenant.tenant()!.slug }}</span>
            <button (click)="masterTenant.clear()"
                    class="text-[10px] font-semibold text-green-600 hover:text-red-600 transition-colors">
              ✕ sair
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class TenantSelectorComponent implements OnInit {
  readonly masterTenant = inject(MasterTenantService);
  private readonly api  = inject(ApiService);

  tenants = signal<TenantOption[]>([]);
  loading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.api.get<{ data: TenantOption[] }>('/tenants?perPage=100'),
      );
      this.tenants.set(res.data);
    } catch { /* silencioso */ } finally {
      this.loading.set(false);
    }
  }

  onSelect(id: string): void {
    if (!id) { this.masterTenant.clear(); return; }
    const t = this.tenants().find(x => x.id === id);
    if (t) this.masterTenant.select(t);
  }
}
