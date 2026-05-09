import {
  Component, signal, computed, input, OnInit, ChangeDetectionStrategy, inject, effect,
  Pipe, PipeTransform,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

// ── Pipes (declarados antes do componente que os usa) ─────────────────────────

@Pipe({ name: 'localNum', standalone: true, pure: true })
export class LocalNumPipe implements PipeTransform {
  transform(n: number): string { return n.toLocaleString('pt-BR'); }
}

@Pipe({ name: 'brl', standalone: true, pure: true })
export class BrlPipe implements PipeTransform {
  transform(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CotaResponse {
  id: string;
  bolaoId: string;
  nomeIdentificacao: string;
  numeroCelular: string | null;
  numeroSequencial: number;
  palpites: number[];
  statusPagamento: 'PENDENTE' | 'PAGO' | 'INATIVO';
  totalAcertosAcumulados: number;
  statusResultado: 'EM_ANDAMENTO' | 'PREMIADO' | 'NAO_PREMIADO';
  criadoEm: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-gestao-cotas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, LocalNumPipe, BrlPipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Dashboard</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Cotas</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Cotas</span>
      <button (click)="showModal.set(true)"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9">
        + Cadastrar
      </button>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">Cotas e participantes</h1>
        <p class="text-slate-500 text-[13.5px]">
          {{ total() | localNum }} pagas ·
          {{ totalPendente() }} pendentes
        </p>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">Cotas pagas</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular">{{ totalPago() | localNum }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">Cotas pendentes</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular text-amber-600">{{ totalPendente() }}</div>
          @if (totalPendente() > 0) {
            <div class="text-xs text-slate-400 mt-0.5">R$ {{ valorPendente().toFixed(2) }} a confirmar</div>
          }
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">Total de cotas</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular">{{ total() | localNum }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">Arrecadação bruta</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular text-green-700">{{ valorBruto() | brl }}</div>
        </div>
      </div>

      <!-- Main card -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">

        <!-- Card header: search + filters -->
        <div class="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Search -->
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input [ngModel]="busca()" (ngModelChange)="onBuscaChange($event)"
                     class="pl-8 pr-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700 w-72"
                     placeholder="Buscar por nome, celular ou nº da cota" />
            </div>
            <!-- Status filter -->
            <select [ngModel]="statusFiltro()" (ngModelChange)="onStatusChange($event)"
                    class="px-2.5 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] bg-white focus:outline-none focus:border-green-700">
              <option value="">Status: Todas</option>
              <option value="PAGO">PAGO</option>
              <option value="PENDENTE">PENDENTE</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold rounded-[10px] text-slate-700 transition-colors">
              ↑ Importar
            </button>
            <button class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold rounded-[10px] text-slate-700 transition-colors">
              ↓ Exportar
            </button>
          </div>
        </div>

        <!-- Error -->
        @if (error()) {
          <div class="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">⚠ {{ error() }}</div>
        }

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Cota</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Participante</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Celular</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Palpites</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Acertos</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Pagamento</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Resultado</th>
                <th class="px-4 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4,5]; track i) {
                  <tr class="border-b border-slate-100">
                    <td colspan="8" class="px-4 py-3">
                      <div class="h-4 bg-slate-100 rounded animate-pulse w-3/4"></div>
                    </td>
                  </tr>
                }
              } @else if (cotas().length === 0) {
                <tr>
                  <td colspan="8" class="px-4 py-12 text-center text-slate-400 text-sm">
                    @if (busca() || statusFiltro()) {
                      Nenhuma cota encontrada para o filtro atual.
                    } @else {
                      Nenhuma cota cadastrada. Clique em "Cadastrar cota" para começar.
                    }
                  </td>
                </tr>
              } @else {
                @for (cota of cotas(); track cota.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">

                    <!-- Nº -->
                    <td class="px-4 py-3 font-mono font-semibold text-[13px]">#{{ cota.numeroSequencial }}</td>

                    <!-- Participante -->
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                          {{ initials(cota.nomeIdentificacao) }}
                        </div>
                        <span class="font-semibold truncate max-w-[180px]">{{ cota.nomeIdentificacao }}</span>
                      </div>
                    </td>

                    <!-- Celular -->
                    <td class="px-4 py-3 font-mono text-slate-400 text-[12px]">{{ cota.numeroCelular ?? '—' }}</td>

                    <!-- Palpites -->
                    <td class="px-4 py-3">
                      <div class="flex flex-wrap gap-[3px]">
                        @for (n of cota.palpites; track n) {
                          <span class="w-[22px] h-[22px] rounded-full flex items-center justify-center font-mono font-semibold text-[10px] border transition-colors"
                                [class]="numerosJaSorteados().has(n)
                                  ? 'bg-green-600 border-green-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-700'">
                            {{ pad(n) }}
                          </span>
                        }
                      </div>
                    </td>

                    <!-- Acertos -->
                    <td class="px-4 py-3">
                      <span class="font-mono font-bold tabular text-[14px]">{{ cota.totalAcertosAcumulados }}/10</span>
                    </td>

                    <!-- Pagamento -->
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                            [class]="statusClass(cota.statusPagamento)">
                        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {{ cota.statusPagamento }}
                      </span>
                    </td>

                    <!-- Resultado -->
                    <td class="px-4 py-3">
                      @if (cota.statusResultado === 'PREMIADO') {
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-amber-50 text-amber-700 border border-amber-100">
                          🏆 PREMIADO
                        </span>
                      } @else if (cota.statusResultado === 'NAO_PREMIADO') {
                        <span class="text-slate-400 text-xs">—</span>
                      } @else {
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 uppercase tracking-wide">
                          Em andamento
                        </span>
                      }
                    </td>

                    <!-- Ação -->
                    <td class="px-4 py-3">
                      @if (cota.statusPagamento === 'PENDENTE') {
                        <button (click)="confirmarPagamento(cota.id)"
                                [disabled]="confirmandoId() === cota.id"
                                class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-[12px] font-semibold rounded-lg transition-colors min-h-8">
                          {{ confirmandoId() === cota.id ? '...' : '✓ Confirmar' }}
                        </button>
                      } @else {
                        <button class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm">
                          ⋯
                        </button>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-slate-400 text-xs">
            Mostrando {{ cotas().length }} de {{ total() | localNum }} cotas
          </span>
          <div class="flex gap-1.5">
            <button (click)="prevPage()" [disabled]="page() <= 1 || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              Anterior
            </button>
            <span class="px-3 py-1.5 text-sm text-slate-500">{{ page() }} / {{ totalPages() }}</span>
            <button (click)="nextPage()" [disabled]="page() >= totalPages() || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal: Nova Cota ──────────────────────────────────────────────────── -->
    @if (showModal()) {
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/40 z-40" (click)="closeModal()"></div>

      <!-- Slide-over panel: full-width mobile, 460px desktop -->
      <div class="fixed right-0 top-0 h-full w-full sm:w-[460px] bg-white shadow-xl z-50 flex flex-col overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="font-display font-semibold text-lg">Cadastrar cota</h2>
            <p class="text-slate-400 text-xs mt-0.5">10 números únicos entre 1 e 60</p>
          </div>
          <button (click)="closeModal()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          <!-- Nome -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome do participante *</label>
            <input [ngModel]="novaNome()" (ngModelChange)="novaNome.set($event)" name="novaNome"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 uppercase"
                   placeholder="NOME COMPLETO" />
          </div>

          <!-- Celular -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Celular</label>
            <input [ngModel]="novaCelular()" (ngModelChange)="novaCelular.set($event)" name="novaCelular" type="tel" inputmode="numeric"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                   placeholder="83999990000" />
          </div>

          <!-- Abas de cotas -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-2 tracking-wide">Palpites</label>

            <!-- Tab headers + botão adicionar -->
            <div class="flex flex-wrap gap-1.5 mb-3">
              @for (cotas of todasCotas(); track $index) {
                <button type="button" (click)="cotaAtualIdx.set($index)"
                        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors"
                        [class]="cotaAtualIdx() === $index
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'">
                  Cota {{ $index + 1 }}
                  <span class="font-mono" [class]="cotas.length === 10 ? 'text-green-300' : ''">
                    {{ cotas.length }}/10
                  </span>
                  @if (todasCotas().length > 1) {
                    <span (click)="$event.stopPropagation(); removerCota($index)"
                          class="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer">✕</span>
                  }
                </button>
              }
              <!-- Botão adicionar cota — inline com as abas -->
              <button type="button" (click)="adicionarCota()"
                      class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold border-2 border-dashed border-green-400 text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-600 transition-colors">
                + Nova cota
              </button>
            </div>

            <!-- Grid da cota ativa -->
            <div class="grid grid-cols-10 gap-1.5 p-4 bg-slate-50 rounded-xl border border-slate-200">
              @for (n of nums60; track n) {
                <button type="button" (click)="togglePalpite(n)"
                        class="w-full aspect-square rounded-full flex items-center justify-center font-mono font-semibold text-[11px] border transition-all"
                        [class]="todasCotas()[cotaAtualIdx()]?.includes(n)
                          ? 'bg-green-700 text-white border-green-700 shadow-sm scale-105'
                          : (todasCotas()[cotaAtualIdx()]?.length ?? 0) >= 10
                            ? 'bg-white text-slate-300 border-slate-200 cursor-not-allowed'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-green-400 hover:text-green-700'">
                  {{ pad(n) }}
                </button>
              }
            </div>

            <!-- Resumo da cota ativa -->
            @if ((todasCotas()[cotaAtualIdx()]?.length ?? 0) > 0) {
              <div class="mt-2 flex flex-wrap gap-1.5">
                @for (n of todasCotas()[cotaAtualIdx()]; track n) {
                  <span class="w-7 h-7 rounded-full flex items-center justify-center font-mono font-semibold text-[11px] bg-green-700 text-white">
                    {{ pad(n) }}
                  </span>
                }
              </div>
            }
          </div>

          @if (modalError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ modalError() }}</div>
          }
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-200 flex gap-2.5 flex-shrink-0">
          <button (click)="closeModal()" class="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-sm rounded-[10px] transition-colors">
            Cancelar
          </button>
          <button (click)="cadastrarCota()"
                  [disabled]="!podeSubmitModal() || modalLoading()"
                  class="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm">
            {{ modalLoading() ? 'Cadastrando...' : todasCotas().length > 1 ? 'Cadastrar ' + todasCotas().length + ' cotas' : 'Cadastrar' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class GestaoCotagsComponent implements OnInit {
  // Route param (withComponentInputBinding)
  readonly id = input<string>('');

  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);

  // ── List state ───────────────────────────────────────────────────────────────
  cotas         = signal<CotaResponse[]>([]);
  sorteios      = signal<{ bolasSorteadas: number[] }[]>([]);
  loading       = signal(false);
  error         = signal('');
  total         = signal(0);
  totalPages    = signal(0);
  page          = signal(1);
  busca         = signal('');
  statusFiltro  = signal('');
  confirmandoId = signal('');

  numerosJaSorteados = computed(() =>
    new Set(this.sorteios().flatMap(s => s.bolasSorteadas)),
  );

  // ── Computed KPIs ─────────────────────────────────────────────────────────────
  totalPago     = computed(() => this.cotas().filter(c => c.statusPagamento === 'PAGO').length);
  totalPendente = computed(() => this.cotas().filter(c => c.statusPagamento === 'PENDENTE').length);
  valorCotaRef  = 30; // TODO: from bolão API
  valorBruto    = computed(() => this.totalPago() * this.valorCotaRef);
  valorPendente = computed(() => this.totalPendente() * this.valorCotaRef);

  // ── Modal state ───────────────────────────────────────────────────────────────
  showModal    = signal(false);
  novaNome     = signal('');
  novaCelular  = signal('');
  todasCotas   = signal<number[][]>([[]]); // array of palpite arrays
  cotaAtualIdx = signal(0);               // which cota grid is active
  modalLoading = signal(false);
  modalError   = signal('');

  podeSubmitModal = computed(() =>
    this.novaNome().trim().length > 0 &&
    this.todasCotas().length > 0 &&
    this.todasCotas().every(p => p.length === 10),
  );

  // ── Helpers ───────────────────────────────────────────────────────────────────
  readonly nums60 = Array.from({ length: 60 }, (_, i) => i + 1);
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.UUID_RE.test(id)) {
        this.loadCotas();
      } else {
        this.resolveActiveBolao();
      }
    });
  }

  ngOnInit(): void {}

  private async resolveActiveBolao(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.api.get<{ data: { id: string }[] }>('/boloes?perPage=1'),
      );
      const first = res.data?.[0];
      if (first?.id) {
        await this.router.navigate(['/bolao', first.id, 'cotas'], { replaceUrl: true });
      } else {
        this.error.set('Nenhum bolão encontrado. Crie um bolão primeiro.');
        this.loading.set(false);
      }
    } catch {
      this.error.set('Erro ao carregar bolão ativo.');
      this.loading.set(false);
    }
  }

  private get bolaoId(): string {
    return this.id();
  }

  // ── Data loading ──────────────────────────────────────────────────────────────
  async loadCotas(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const params = new URLSearchParams({
        page: String(this.page()),
        perPage: '50',
        ...(this.busca()       && { busca: this.busca() }),
        ...(this.statusFiltro() && { status: this.statusFiltro() }),
      });
      const [cotasRes, sorteiosRes] = await Promise.all([
        firstValueFrom(this.api.get<Paginated<CotaResponse>>(`/boloes/${this.bolaoId}/cotas?${params}`)),
        firstValueFrom(this.api.get<{ bolasSorteadas: number[] }[]>(`/boloes/${this.bolaoId}/sorteios`)).catch(() => []),
      ]);
      this.cotas.set(cotasRes.data);
      this.total.set(cotasRes.total);
      this.totalPages.set(cotasRes.totalPages);
      this.sorteios.set(sorteiosRes);
    } catch {
      this.error.set('Erro ao carregar cotas. Verifique a conexão com a API.');
      this.cotas.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onBuscaChange(value: string): void {
    this.busca.set(value);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.page.set(1);
      this.loadCotas();
    }, 400);
  }

  onStatusChange(value: string): void {
    this.statusFiltro.set(value);
    this.page.set(1);
    this.loadCotas();
  }

  prevPage(): void {
    if (this.page() > 1) { this.page.update(p => p - 1); this.loadCotas(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.loadCotas(); }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  async confirmarPagamento(cotaId: string): Promise<void> {
    this.confirmandoId.set(cotaId);
    try {
      await firstValueFrom(
        this.api.patch(`/boloes/${this.bolaoId}/cotas/${cotaId}/pagar`, {}),
      );
      this.cotas.update(cotas =>
        cotas.map(c => c.id === cotaId ? { ...c, statusPagamento: 'PAGO' as const } : c),
      );
    } catch {
      this.error.set('Erro ao confirmar pagamento. Tente novamente.');
    } finally {
      this.confirmandoId.set('');
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────
  closeModal(): void {
    this.showModal.set(false);
    this.novaNome.set('');
    this.novaCelular.set('');
    this.todasCotas.set([[]]);
    this.cotaAtualIdx.set(0);
    this.modalError.set('');
  }

  togglePalpite(n: number): void {
    const idx = this.cotaAtualIdx();
    this.todasCotas.update(all => {
      const copy = all.map(p => [...p]);
      const cur = copy[idx];
      copy[idx] = cur.includes(n)
        ? cur.filter(x => x !== n)
        : cur.length < 10 ? [...cur, n].sort((a, b) => a - b) : cur;
      return copy;
    });
  }

  adicionarCota(): void {
    this.todasCotas.update(all => [...all, []]);
    this.cotaAtualIdx.set(this.todasCotas().length - 1);
  }

  removerCota(idx: number): void {
    if (this.todasCotas().length <= 1) return;
    this.todasCotas.update(all => all.filter((_, i) => i !== idx));
    const newLen = this.todasCotas().length;
    if (this.cotaAtualIdx() >= newLen) this.cotaAtualIdx.set(newLen - 1);
  }

  async cadastrarCota(): Promise<void> {
    if (!this.podeSubmitModal() || this.modalLoading()) return;
    this.modalLoading.set(true);
    this.modalError.set('');
    try {
      for (const palpites of this.todasCotas()) {
        await firstValueFrom(
          this.api.post(`/boloes/${this.bolaoId}/cotas`, {
            nomeIdentificacao: this.novaNome().trim().toUpperCase(),
            numeroCelular:     this.novaCelular().replace(/\D/g, '') || undefined,
            palpites,
          }),
        );
      }
      this.closeModal();
      await this.loadCotas();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao cadastrar cota.';
      this.modalError.set(msg);
    } finally {
      this.modalLoading.set(false);
    }
  }

  // ── Template helpers ──────────────────────────────────────────────────────────
  pad(n: number): string { return String(n).padStart(2, '0'); }

  initials(nome: string): string {
    return nome.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }

  statusClass(s: string): string {
    if (s === 'PAGO')    return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'INATIVO') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-700 border-amber-100'; // PENDENTE
  }
}

