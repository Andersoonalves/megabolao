import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { MegaSenaAlertComponent } from '../../../shared/components/mega-sena-alert/mega-sena-alert.component';
import { BrlPipe, LocalNumPipe } from '../../../shared/pipes/locale-pipes';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantResponse {
  id: string;
  nome: string;
  slug: string;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  taxaAdministrativaPct: number;
  branding: { corPrimaria?: string; logoUrl?: string; nomeCustomizado?: string };
  criadoEm: string;
  atualizadoEm: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// Dados enriquecidos para exibição (bolões/cotas/arrec vêm de agregação futura)
interface TenantDisplay extends TenantResponse {
  boloes: number;
  cotas: number;
  arrec: number;
  admins: number;
}

// Fallback estático enquanto endpoint de stats não existe
const STATIC_STATS: Record<string, Omit<TenantDisplay, keyof TenantResponse>> = {
  'bolao-cg':         { boloes: 3, cotas: 9244,  arrec: 184880, admins: 2 },
  'joao-loto':        { boloes: 1, cotas: 1180,  arrec: 23600,  admins: 1 },
  'sorte-total-rj':   { boloes: 2, cotas: 4720,  arrec: 94400,  admins: 3 },
  'mega-vizinhos':    { boloes: 0, cotas: 0,     arrec: 0,      admins: 1 },
  'bolao-firma':      { boloes: 1, cotas: 540,   arrec: 10800,  admins: 1 },
  'trevo':            { boloes: 0, cotas: 0,     arrec: 0,      admins: 1 },
};

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-dashboard-master',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocalNumPipe, BrlPipe, TranslatePipe, MegaSenaAlertComponent],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">{{ 'dashboardMaster.breadcrumb' | translate }}</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">{{ 'dashboardMaster.overview' | translate }}</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">{{ 'dashboardMaster.breadcrumb' | translate }}</span>
      <div class="flex gap-2">
        <a routerLink="/tenants"
           class="inline-flex items-center px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-700 transition-colors min-h-9 hidden sm:inline-flex">
          {{ 'dashboardMaster.viewAll' | translate }}
        </a>
        <a routerLink="/tenants/novo"
           class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
          {{ 'dashboardMaster.newTenant' | translate }}
        </a>
      </div>
    </div>

    <nb-mega-sena-alert />

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-6">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">{{ 'dashboardMaster.title' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px]">
          {{ 'dashboardMaster.subtitle' | translate: { n: tenants().length, a: ativosCount() } }}
        </p>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'dashboardMaster.kpiTenants' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular">{{ ativosCount() }}</div>
          <div class="text-xs text-green-700 mt-0.5">{{ 'dashboardMaster.kpiGrowth' | translate }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'dashboardMaster.kpiPools' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular">{{ totalBoloes() }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'dashboardMaster.kpiQuotas' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular text-blue-600">{{ totalCotas() | localNum }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'dashboardMaster.kpiRevenue' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular text-green-700">{{ totalArrec() | brl:'compact' }}</div>
        </div>
      </div>

      <!-- Tenants table -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden mb-5">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <h3 class="font-display font-semibold text-[15px]">{{ 'dashboardMaster.sectionTenants' | translate }}</h3>
          <div class="flex gap-2">
            <button type="button" class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold rounded-[10px] text-slate-700 transition-colors">
              {{ 'dashboardMaster.filter' | translate }}
            </button>
            <button type="button" class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold rounded-[10px] text-slate-700 transition-colors">
              {{ 'dashboardMaster.export' | translate }}
            </button>
          </div>
        </div>

        @if (error()) {
          <div class="px-5 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">⚠ {{ error() }}</div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 min-w-[200px]">{{ 'dashboardMaster.thCompany' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden md:table-cell">{{ 'dashboardMaster.thSlug' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'dashboardMaster.thStatus' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden lg:table-cell">{{ 'dashboardMaster.thPools' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden lg:table-cell">{{ 'dashboardMaster.thQuotas' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden sm:table-cell">{{ 'dashboardMaster.thRevenue' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden xl:table-cell">{{ 'dashboardMaster.thAdmins' | translate }}</th>
                <th class="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4,5,6]; track i) {
                  <tr class="border-b border-slate-100">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-slate-100 rounded-full animate-pulse flex-shrink-0"></div>
                        <div class="h-4 bg-slate-100 rounded animate-pulse flex-1 max-w-[140px]"></div>
                      </div>
                    </td>
                    <td class="px-4 py-3 hidden md:table-cell"><div class="h-4 bg-slate-100 rounded animate-pulse w-24"></div></td>
                    <td class="px-4 py-3"><div class="h-5 bg-slate-100 rounded-full animate-pulse w-16"></div></td>
                    <td colspan="5" class="px-4 py-3"></td>
                  </tr>
                }
              } @else if (tenants().length === 0) {
                <tr>
                  <td colspan="8" class="px-4 py-12 text-center text-slate-400 text-sm">
                    {{ 'dashboardMaster.emptyTenants' | translate }}
                    <a routerLink="/tenants" class="text-green-700 font-semibold ml-1 no-underline">{{ 'dashboardMaster.createFirstTenant' | translate }}</a>
                  </td>
                </tr>
              } @else {
                @for (t of tenants(); track t.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                    <!-- Empresa -->
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs flex-shrink-0"
                             [style.background]="t.branding.corPrimaria ? t.branding.corPrimaria + '20' : '#f1f5f9'"
                             [style.color]="t.branding.corPrimaria ?? '#334155'">
                          {{ initials(t.nome) }}
                        </div>
                        <div class="min-w-0">
                          <div class="font-semibold truncate">{{ t.nome }}</div>
                          <div class="text-[11.5px] text-slate-400 truncate hidden sm:block">portal.{{ t.slug }}.com.br</div>
                        </div>
                      </div>
                    </td>

                    <!-- Slug -->
                    <td class="px-4 py-3 font-mono text-[12px] text-slate-400 hidden md:table-cell">{{ t.slug }}</td>

                    <!-- Status -->
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                            [class]="statusClass(t.status)">
                        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {{ tenantStatusKey(t.status) | translate }}
                      </span>
                    </td>

                    <!-- Bolões -->
                    <td class="px-4 py-3 tabular text-center hidden lg:table-cell">{{ stats(t).boloes }}</td>

                    <!-- Cotas -->
                    <td class="px-4 py-3 tabular hidden lg:table-cell">{{ stats(t).cotas | localNum }}</td>

                    <!-- Arrecadação -->
                    <td class="px-4 py-3 font-mono font-semibold tabular text-[13px] hidden sm:table-cell">
                      {{ stats(t).arrec | brl:'compact' }}
                    </td>

                    <!-- Admins -->
                    <td class="px-4 py-3 tabular text-center hidden xl:table-cell">{{ stats(t).admins }}</td>

                    <!-- Actions -->
                    <td class="px-4 py-3">
                      <div class="flex gap-1 justify-end">
                        <button type="button" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors text-sm" [attr.title]="'dashboardMaster.titleDetails' | translate">👁</button>
                        <button type="button" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm" [attr.title]="'dashboardMaster.titleMore' | translate">⋯</button>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (!loading() && tenants().length > 0) {
          <div class="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
            {{ 'dashboardMaster.tenantsShown' | translate: { n: tenants().length } }}
          </div>
        }
      </div>

      <!-- Bottom row: Atividade + Saúde -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- Atividade recente -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200">
            <h3 class="font-display font-semibold text-[15px]">{{ 'dashboardMaster.activity' | translate }}</h3>
          </div>
          <div>
            @for (a of atividades; track a.whatKey) {
              <div class="flex items-start gap-3 px-5 py-3.5 border-b border-slate-100 last:border-0">
                <div class="w-8 h-8 rounded-[8px] bg-slate-100 text-slate-600 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                  {{ a.icon }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-semibold">{{ a.whatKey | translate }}</div>
                  <div class="text-[11.5px] text-slate-400">{{ a.whoKey | translate }} · {{ a.whenKey | translate }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Saúde do sistema -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200">
            <h3 class="font-display font-semibold text-[15px]">{{ 'dashboardMaster.health' | translate }}</h3>
          </div>
          <div class="p-5 flex flex-col gap-4">
            @for (h of saude; track h.labelKey) {
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-[13px] font-semibold">{{ h.labelKey | translate }}</div>
                  <div class="text-[11.5px] text-slate-400 mt-0.5">{{ h.detalheKey | translate }}</div>
                </div>
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                      [class]="h.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-100'">
                  <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {{ h.statusKey | translate }}
                </span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DashboardMasterComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  // ── State ──────────────────────────────────────────────────────────────────
  tenants = signal<TenantDisplay[]>([]);
  loading = signal(false);
  error   = signal('');

  // ── Computed KPIs ──────────────────────────────────────────────────────────
  ativosCount  = computed(() => this.tenants().filter(t => t.status === 'ATIVO').length);
  totalBoloes  = computed(() => this.tenants().reduce((s, t) => s + t.boloes, 0));
  totalCotas   = computed(() => this.tenants().reduce((s, t) => s + t.cotas, 0));
  totalArrec   = computed(() => this.tenants().reduce((s, t) => s + t.arrec, 0));

  // ── Static data ────────────────────────────────────────────────────────────
  atividades = [
    { icon: '✦', whoKey: 'dashboardMaster.act1Who', whatKey: 'dashboardMaster.act1What', whenKey: 'dashboardMaster.act1When' },
    { icon: '+', whoKey: 'dashboardMaster.act2Who', whatKey: 'dashboardMaster.act2What', whenKey: 'dashboardMaster.act2When' },
    { icon: '🏆', whoKey: 'dashboardMaster.act3Who', whatKey: 'dashboardMaster.act3What', whenKey: 'dashboardMaster.act3When' },
    { icon: '💬', whoKey: 'dashboardMaster.act4Who', whatKey: 'dashboardMaster.act4What', whenKey: 'dashboardMaster.act4When' },
    { icon: '⏸', whoKey: 'dashboardMaster.act5Who', whatKey: 'dashboardMaster.act5What', whenKey: 'dashboardMaster.act5When' },
  ];

  saude = [
    { labelKey: 'dashboardMaster.health1Label', detalheKey: 'dashboardMaster.health1Detail', statusKey: 'dashboardMaster.health1Status', ok: true },
    { labelKey: 'dashboardMaster.health2Label', detalheKey: 'dashboardMaster.health2Detail', statusKey: 'dashboardMaster.health2Status', ok: true },
    { labelKey: 'dashboardMaster.health3Label', detalheKey: 'dashboardMaster.health3Detail', statusKey: 'dashboardMaster.health3Status', ok: true },
    { labelKey: 'dashboardMaster.health4Label', detalheKey: 'dashboardMaster.health4Detail', statusKey: 'dashboardMaster.health4Status', ok: false },
    { labelKey: 'dashboardMaster.health5Label', detalheKey: 'dashboardMaster.health5Detail', statusKey: 'dashboardMaster.health5Status', ok: true },
  ];

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadTenants();
  }

  async loadTenants(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.api.get<Paginated<TenantResponse>>('/tenants?perPage=100'),
      );
      this.tenants.set(res.data.map(t => this.enrich(t)));
    } catch {
      this.error.set(this.translate.instant('dashboardMaster.errLoadTenants'));
      // Fallback: dados estáticos do protótipo
      this.tenants.set(DEMO_TENANTS.map(t => this.enrich(t)));
    } finally {
      this.loading.set(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private enrich(t: TenantResponse): TenantDisplay {
    const s = STATIC_STATS[t.slug] ?? { boloes: 0, cotas: 0, arrec: 0, admins: 1 };
    return { ...t, ...s };
  }

  stats(t: TenantDisplay) {
    return { boloes: t.boloes, cotas: t.cotas, arrec: t.arrec, admins: t.admins };
  }

  initials(nome: string): string {
    return nome.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }

  statusClass(s: string): string {
    if (s === 'ATIVO')    return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'SUSPENSO') return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-red-50 text-red-700 border-red-200';
  }

  tenantStatusKey(s: TenantResponse['status']): string {
    if (s === 'ATIVO') return 'tenants.statusATIVO';
    if (s === 'SUSPENSO') return 'tenants.statusSUSPENSO';
    return 'tenants.statusINATIVO';
  }
}

// ── Demo fallback ─────────────────────────────────────────────────────────────

const DEMO_TENANTS: TenantResponse[] = [
  { id: '1', nome: 'Bolão CG',       slug: 'bolao-cg',       status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#047857' }, criadoEm: '', atualizadoEm: '' },
  { id: '2', nome: 'Loteria do João', slug: 'joao-loto',     status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#2563eb' }, criadoEm: '', atualizadoEm: '' },
  { id: '3', nome: 'Sorte Total RJ',  slug: 'sorte-total-rj',status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#7c3aed' }, criadoEm: '', atualizadoEm: '' },
  { id: '4', nome: 'Mega Vizinhos',   slug: 'mega-vizinhos', status: 'SUSPENSO', taxaAdministrativaPct: 15, branding: {},                        criadoEm: '', atualizadoEm: '' },
  { id: '5', nome: 'Bolão da Firma',  slug: 'bolao-firma',   status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#d97706' }, criadoEm: '', atualizadoEm: '' },
  { id: '6', nome: 'Trevo da Sorte',  slug: 'trevo',         status: 'INATIVO',  taxaAdministrativaPct: 15, branding: {},                        criadoEm: '', atualizadoEm: '' },
];
