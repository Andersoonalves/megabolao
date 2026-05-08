import {
  Component, signal, OnInit, ChangeDetectionStrategy, inject,
  Pipe, PipeTransform,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

@Pipe({ name: 'tBrl', standalone: true, pure: true })
export class TBrlPipe implements PipeTransform {
  transform(n: number): string {
    if (n >= 1_000_000) return `R$ ${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `R$ ${(n/1_000).toFixed(0)}k`;
    return `R$ ${n.toFixed(0)}`;
  }
}

interface TenantResponse {
  id: string; nome: string; slug: string;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  taxaAdministrativaPct: number;
  branding: { corPrimaria?: string };
  criadoEm: string; atualizadoEm: string;
}
interface Paginated<T> { data: T[]; total: number; page: number; totalPages: number; }

@Component({
  selector: 'nb-tenants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TBrlPipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Plataforma</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Tenants</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Tenants</span>
      <a routerLink="/tenants/novo"
         class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
        + Novo tenant
      </a>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">Tenants</h1>
          <p class="text-slate-500 text-[13.5px]">{{ total() }} tenants cadastrados</p>
        </div>
      </div>

      @if (error()) {
        <div class="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ error() }}</div>
      }

      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 min-w-[200px]">Empresa</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 hidden md:table-cell">Slug</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3">Status</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 hidden lg:table-cell">Taxa adm.</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 hidden sm:table-cell">Criado em</th>
                <th class="px-5 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4,5,6]; track i) {
                  <tr class="border-b border-slate-100">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-100 animate-pulse flex-shrink-0"></div>
                        <div class="h-4 bg-slate-100 rounded animate-pulse flex-1 max-w-[140px]"></div>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell"><div class="h-4 bg-slate-100 rounded animate-pulse w-24"></div></td>
                    <td class="px-5 py-4"><div class="h-5 bg-slate-100 rounded-full animate-pulse w-16"></div></td>
                    <td colspan="3"></td>
                  </tr>
                }
              } @else if (tenants().length === 0) {
                <tr>
                  <td colspan="6" class="px-5 py-16 text-center">
                    <div class="text-3xl mb-3">🏢</div>
                    <p class="text-slate-500 text-sm mb-4">Nenhum tenant cadastrado ainda.</p>
                    <a routerLink="/tenants/novo"
                       class="inline-flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors">
                      + Criar primeiro tenant
                    </a>
                  </td>
                </tr>
              } @else {
                @for (t of tenants(); track t.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                    <!-- Empresa -->
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs flex-shrink-0"
                             [style.background]="t.branding.corPrimaria ? t.branding.corPrimaria + '20' : '#f1f5f9'"
                             [style.color]="t.branding.corPrimaria ?? '#334155'">
                          {{ initials(t.nome) }}
                        </div>
                        <div class="min-w-0">
                          <div class="font-semibold truncate">{{ t.nome }}</div>
                          <div class="text-[11.5px] text-slate-400 hidden sm:block truncate">portal.{{ t.slug }}.com.br</div>
                        </div>
                      </div>
                    </td>

                    <!-- Slug -->
                    <td class="px-5 py-4 font-mono text-[12px] text-slate-400 hidden md:table-cell">{{ t.slug }}</td>

                    <!-- Status -->
                    <td class="px-5 py-4">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                            [class]="statusClass(t.status)">
                        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {{ t.status }}
                      </span>
                    </td>

                    <!-- Taxa -->
                    <td class="px-5 py-4 tabular text-[13px] hidden lg:table-cell">{{ t.taxaAdministrativaPct }}%</td>

                    <!-- Criado em -->
                    <td class="px-5 py-4 text-slate-400 text-[12px] hidden sm:table-cell">{{ fmtDate(t.criadoEm) }}</td>

                    <!-- Actions -->
                    <td class="px-5 py-4">
                      <div class="flex gap-1 justify-end">
                        <button class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors text-sm" title="Editar">✏</button>
                        <button (click)="toggleStatus(t)"
                                class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-sm"
                                [title]="t.status === 'ATIVO' ? 'Suspender' : 'Ativar'">
                          {{ t.status === 'ATIVO' ? '⏸' : '▶' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Paginação -->
        @if (totalPages() > 1) {
          <div class="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span class="text-xs text-slate-400">{{ tenants().length }} de {{ total() }}</span>
            <div class="flex gap-1.5">
              <button (click)="prevPage()" [disabled]="page() <= 1"
                      class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40">Anterior</button>
              <button (click)="nextPage()" [disabled]="page() >= totalPages()"
                      class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40">Próxima</button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class TenantsComponent implements OnInit {
  private readonly api = inject(ApiService);

  tenants    = signal<TenantResponse[]>([]);
  loading    = signal(false);
  error      = signal('');
  total      = signal(0);
  totalPages = signal(1);
  page       = signal(1);

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.api.get<Paginated<TenantResponse>>(`/tenants?page=${this.page()}&perPage=20`),
      );
      this.tenants.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.totalPages);
    } catch {
      this.error.set('Erro ao carregar tenants. Exibindo dados de demonstração.');
      this.tenants.set(DEMO_TENANTS);
      this.total.set(DEMO_TENANTS.length);
    } finally { this.loading.set(false); }
  }

  async toggleStatus(t: TenantResponse): Promise<void> {
    const novoStatus = t.status === 'ATIVO' ? 'SUSPENSO' : 'ATIVO';
    try {
      await firstValueFrom(this.api.patch(`/tenants/${t.id}`, { status: novoStatus }));
      this.tenants.update(ts => ts.map(x => x.id === t.id ? { ...x, status: novoStatus as TenantResponse['status'] } : x));
    } catch { this.error.set('Erro ao alterar status.'); }
  }

  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); } }

  initials(nome: string): string { return nome.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase(); }

  statusClass(s: string): string {
    if (s === 'ATIVO')    return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'SUSPENSO') return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-red-50 text-red-700 border-red-200';
  }

  fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return '—'; }
  }
}

const DEMO_TENANTS: TenantResponse[] = [
  { id: '1', nome: 'Bolão CG',        slug: 'bolao-cg',        status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#047857' }, criadoEm: '2026-01-10T00:00:00Z', atualizadoEm: '' },
  { id: '2', nome: 'Loteria do João', slug: 'joao-loto',        status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#2563eb' }, criadoEm: '2026-02-05T00:00:00Z', atualizadoEm: '' },
  { id: '3', nome: 'Sorte Total RJ',  slug: 'sorte-total-rj',   status: 'ATIVO',    taxaAdministrativaPct: 20, branding: { corPrimaria: '#7c3aed' }, criadoEm: '2026-02-18T00:00:00Z', atualizadoEm: '' },
  { id: '4', nome: 'Mega Vizinhos',   slug: 'mega-vizinhos',    status: 'SUSPENSO', taxaAdministrativaPct: 15, branding: {},                        criadoEm: '2026-03-01T00:00:00Z', atualizadoEm: '' },
  { id: '5', nome: 'Bolão da Firma',  slug: 'bolao-firma',      status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#d97706' }, criadoEm: '2026-03-15T00:00:00Z', atualizadoEm: '' },
  { id: '6', nome: 'Trevo da Sorte',  slug: 'trevo',            status: 'INATIVO',  taxaAdministrativaPct: 15, branding: {},                        criadoEm: '2026-04-01T00:00:00Z', atualizadoEm: '' },
];
