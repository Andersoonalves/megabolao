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
  templateUrl: './dashboard-master.component.html',
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
