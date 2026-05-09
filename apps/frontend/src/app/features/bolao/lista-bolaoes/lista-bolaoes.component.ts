import {
  Component, signal, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

interface BolaoResponse {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
  dataInicio: string | null;
  dataTermino: string | null;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  criadoEm: string;
}

interface Paginated<T> { data: T[]; total: number; page: number; totalPages: number; }

@Component({
  selector: 'nb-lista-bolaoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Bolões</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Todos os bolões</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Bolões</span>
      <a routerLink="/bolao/novo"
         class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
        + Novo bolão
      </a>
    </div>

    <!-- Filtros -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-2.5 flex flex-wrap gap-2">
      <div class="relative flex-1 min-w-[180px] max-w-xs">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]">🔍</span>
        <input [ngModel]="busca()" (ngModelChange)="onBuscaChange($event)"
               class="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
               placeholder="Buscar por nome..." />
      </div>
      <select [ngModel]="statusFiltro()" (ngModelChange)="onStatusChange($event)"
              class="px-3 py-2 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-green-700">
        <option value="">Todos os status</option>
        <option value="A_SER_INICIADO">A iniciar</option>
        <option value="EM_ANDAMENTO">Em andamento</option>
        <option value="FINALIZADO">Finalizado</option>
        <option value="SUSPENSO">Suspenso</option>
      </select>
      @if (busca() || statusFiltro()) {
        <button (click)="limparFiltros()"
                class="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-[10px] hover:bg-slate-50 transition-colors">
          ✕ Limpar
        </button>
      }
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">Bolões</h1>
        <p class="text-slate-500 text-[13.5px]">{{ total() }} bolões cadastrados</p>
      </div>

      @if (error()) {
        <div class="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
          <span>⚠</span><span>{{ error() }}</span>
        </div>
      }

      <!-- Cards grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

        @if (loading()) {
          @for (i of [1,2,3]; track i) {
            <div class="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
              <div class="h-4 bg-slate-100 rounded w-3/4 mb-3"></div>
              <div class="h-3 bg-slate-100 rounded w-1/2 mb-6"></div>
              <div class="grid grid-cols-2 gap-3">
                <div class="h-10 bg-slate-100 rounded-lg"></div>
                <div class="h-10 bg-slate-100 rounded-lg"></div>
              </div>
            </div>
          }
        } @else if (bolaoes().length === 0) {
          <div class="col-span-full bg-white border border-slate-200 rounded-xl px-5 py-16 text-center">
            <div class="text-4xl mb-3">🎲</div>
            <p class="text-slate-500 text-sm mb-4">Nenhum bolão encontrado.</p>
            <a routerLink="/bolao/novo"
               class="inline-flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors">
              + Criar primeiro bolão
            </a>
          </div>
        } @else {
          @for (b of bolaoes(); track b.id) {
            <div class="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 hover:border-slate-300 transition-colors">

              <!-- Header -->
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h2 class="font-display font-semibold text-[15px] truncate">{{ b.nome }}</h2>
                  <p class="text-[12px] text-slate-400 mt-0.5">
                    {{ b.dataInicio ? fmtDate(b.dataInicio) : '—' }}
                    @if (b.dataTermino) { → {{ fmtDate(b.dataTermino) }} }
                  </p>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                        [class]="statusClass(b.status)">
                    <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                    {{ statusLabel(b.status) }}
                  </span>
                  @if (b.status === 'A_SER_INICIADO') {
                    <button (click)="abrirEdicao(b)"
                            class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors text-sm"
                            title="Editar bolão">✏</button>
                  }
                </div>
              </div>

              <!-- KPIs -->
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="bg-slate-50 rounded-lg py-2.5 px-1">
                  <div class="font-display font-bold text-[16px] tabular">{{ b.totalCotasAtivas }}</div>
                  <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">Cotas</div>
                </div>
                <div class="bg-slate-50 rounded-lg py-2.5 px-1">
                  <div class="font-display font-bold text-[13px] tabular">{{ brl(b.valorCota) }}</div>
                  <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">Valor</div>
                </div>
                <div class="bg-slate-50 rounded-lg py-2.5 px-1">
                  <div class="font-display font-bold text-[13px] tabular text-green-700">{{ brl(b.valorBrutoArrecadado) }}</div>
                  <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">Arrecad.</div>
                </div>
              </div>

              <!-- Ações -->
              <div class="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                <a [routerLink]="['/bolao', b.id, 'cotas']"
                   class="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-slate-50 transition-colors no-underline text-slate-600 hover:text-green-700">
                  <span class="text-base">🎫</span>
                  <span class="text-[11px] font-semibold">Cotas</span>
                </a>
                <a routerLink="/sorteios"
                   class="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-slate-50 transition-colors no-underline text-slate-600 hover:text-green-700">
                  <span class="text-base">✦</span>
                  <span class="text-[11px] font-semibold">Sorteios</span>
                </a>
                <a [routerLink]="['/bolao', b.id, 'premios']"
                   class="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-slate-50 transition-colors no-underline text-slate-600 hover:text-green-700">
                  <span class="text-base">🏆</span>
                  <span class="text-[11px] font-semibold">Prêmios</span>
                </a>
              </div>
            </div>
          }
        }
      </div>

      <!-- Paginação -->
      @if (!loading() && totalPages() > 1) {
        <div class="mt-5 flex items-center justify-between">
          <span class="text-xs text-slate-400">{{ bolaoes().length }} de {{ total() }}</span>
          <div class="flex gap-1.5">
            <button (click)="prevPage()" [disabled]="page() <= 1"
                    class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40">
              Anterior
            </button>
            <button (click)="nextPage()" [disabled]="page() >= totalPages()"
                    class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40">
              Próxima
            </button>
          </div>
        </div>
      }
    </div>

    <!-- ── Modal: Editar Bolão ──────────────────────────────────────────────── -->
    @if (editando()) {
      <div class="fixed inset-0 bg-black/40 z-40" (click)="fecharEdicao()"></div>
      <div class="fixed right-0 top-0 h-full w-full sm:w-[440px] bg-white z-50 flex flex-col shadow-xl overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="font-display font-semibold text-lg">Editar bolão</h2>
            <p class="text-slate-400 text-xs mt-0.5">Somente bolões A_SER_INICIADO podem ser editados</p>
          </div>
          <button (click)="fecharEdicao()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-lg">✕</button>
        </div>

        <!-- Conteúdo -->
        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          @if (editError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
              <span>⚠</span><span>{{ editError() }}</span>
            </div>
          }

          <!-- Nome -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome do bolão</label>
            <input [ngModel]="editNome()" (ngModelChange)="editNome.set($event)" name="editNome"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                   placeholder="Ex: Bolão Junho 2026" />
          </div>

          <!-- Valor da cota -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Valor da cota (R$)</label>
            <input [ngModel]="editValorCota()" (ngModelChange)="editValorCota.set(+$event)" name="editValorCota"
                   type="number" min="0.01" step="0.01" inputmode="decimal"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm tabular focus:outline-none focus:border-green-700" />
          </div>

          <!-- Datas -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Data início</label>
              <input [ngModel]="editDataInicio()" (ngModelChange)="editDataInicio.set($event)" name="editDataInicio"
                     type="date"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Data término</label>
              <input [ngModel]="editDataTermino()" (ngModelChange)="editDataTermino.set($event)" name="editDataTermino"
                     type="date"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700" />
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-200 flex gap-2.5 flex-shrink-0">
          <button (click)="fecharEdicao()" class="flex-1 py-2.5 bg-white border border-slate-200 font-semibold text-sm rounded-[10px] hover:bg-slate-50">
            Cancelar
          </button>
          <button (click)="salvarEdicao()" [disabled]="editLoading() || !editNome().trim()"
                  class="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold text-sm rounded-[10px] shadow-sm">
            {{ editLoading() ? 'Salvando...' : '✓ Salvar' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class ListaBolaoesComponent implements OnInit {
  private readonly api = inject(ApiService);

  // ── List state ────────────────────────────────────────────────────────────────
  bolaoes      = signal<BolaoResponse[]>([]);
  loading      = signal(true);
  error        = signal('');
  total        = signal(0);
  totalPages   = signal(1);
  page         = signal(1);
  busca        = signal('');
  statusFiltro = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Edit state ────────────────────────────────────────────────────────────────
  editando       = signal<BolaoResponse | null>(null);
  editNome       = signal('');
  editValorCota  = signal(0);
  editDataInicio = signal('');
  editDataTermino = signal('');
  editLoading    = signal(false);
  editError      = signal('');

  ngOnInit(): void { this.load(); }

  // ── Filtros ───────────────────────────────────────────────────────────────────
  onBuscaChange(v: string): void {
    this.busca.set(v);
    this.page.set(1);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.load(), 350);
  }

  onStatusChange(v: string): void {
    this.statusFiltro.set(v);
    this.page.set(1);
    this.load();
  }

  limparFiltros(): void {
    this.busca.set('');
    this.statusFiltro.set('');
    this.page.set(1);
    this.load();
  }

  // ── Load ──────────────────────────────────────────────────────────────────────
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const params = new URLSearchParams({
      page:    String(this.page()),
      perPage: '12',
      ...(this.busca()        && { busca:  this.busca() }),
      ...(this.statusFiltro() && { status: this.statusFiltro() }),
    });
    try {
      const res = await firstValueFrom(
        this.api.get<Paginated<BolaoResponse>>(`/boloes?${params}`),
      );
      this.bolaoes.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.totalPages);
    } catch (err: unknown) {
      type E = { error?: { message?: string }; status?: number };
      const e = err as E;
      this.error.set(e.error?.message ?? `Erro ao carregar bolões${e.status ? ` [${e.status}]` : ''}`);
    } finally {
      this.loading.set(false);
    }
  }

  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); } }

  // ── Edição ────────────────────────────────────────────────────────────────────
  abrirEdicao(b: BolaoResponse): void {
    this.editando.set(b);
    this.editNome.set(b.nome);
    this.editValorCota.set(b.valorCota);
    this.editDataInicio.set(b.dataInicio ?? '');
    this.editDataTermino.set(b.dataTermino ?? '');
    this.editError.set('');
  }

  fecharEdicao(): void { this.editando.set(null); }

  async salvarEdicao(): Promise<void> {
    const b = this.editando();
    if (!b || this.editLoading() || !this.editNome().trim()) return;
    this.editLoading.set(true);
    this.editError.set('');
    try {
      const updated = await firstValueFrom(
        this.api.patch<BolaoResponse>(`/boloes/${b.id}`, {
          nome:        this.editNome().trim(),
          valorCota:   this.editValorCota(),
          ...(this.editDataInicio()  && { dataInicio:  this.editDataInicio() }),
          ...(this.editDataTermino() && { dataTermino: this.editDataTermino() }),
        }),
      );
      this.bolaoes.update(bs => bs.map(x => x.id === b.id ? updated : x));
      this.fecharEdicao();
    } catch (err: unknown) {
      type E = { error?: { message?: string }; status?: number };
      const e = err as E;
      this.editError.set(e.error?.message ?? `Erro ao salvar${e.status ? ` [${e.status}]` : ''}`);
    } finally {
      this.editLoading.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  statusClass(s: string): string {
    if (s === 'EM_ANDAMENTO')   return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'A_SER_INICIADO') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'FINALIZADO')     return 'bg-slate-100 text-slate-500 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      EM_ANDAMENTO:   'Em andamento',
      A_SER_INICIADO: 'A iniciar',
      FINALIZADO:     'Finalizado',
      SUSPENSO:       'Suspenso',
    };
    return m[s] ?? s;
  }

  fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return '—'; }
  }

  brl(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
}
