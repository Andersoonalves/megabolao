import {
  Component, signal, computed, input, OnInit, ChangeDetectionStrategy, inject, effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SorteioResponse {
  id: string;
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  sequenciaNoBolao: number;
  ehPrimeiro: boolean;
  processado: boolean;
  criadoEm: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-registrar-sorteio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <div class="flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Dashboard</span>
        <span class="text-slate-300">›</span>
        <span class="text-slate-400">Bolão</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Registrar sorteio</span>
      </div>
      <button (click)="submit()"
              [disabled]="!valido() || loading()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm">
        {{ loading() ? 'Registrando...' : '✓ Registrar e calcular acertos' }}
      </button>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7 max-w-[1100px]">
      <div class="mb-6">
        <h1 class="font-display text-[26px] font-semibold tracking-tight mb-1">Registrar sorteio</h1>
        <p class="text-slate-500 text-[13.5px]">Após registrar, um job BullMQ calcula os acertos das cotas em segundo plano.</p>
      </div>

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <span>⚠</span> {{ error() }}
        </div>
      }

      @if (sucesso()) {
        <div class="mb-5 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 flex items-center gap-2">
          <span>✓</span> Sorteio {{ numeroConcurso }} registrado com sucesso! Job de cálculo de acertos disparado.
          <a routerLink="/dashboard" class="ml-auto text-green-700 font-semibold no-underline flex-shrink-0">Ir ao Dashboard →</a>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        <!-- Coluna principal -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="font-display font-semibold text-[15px]">
              Sorteio {{ nextSequencia() }} do bolão
            </h3>
            @if (nextSequencia() > 1) {
              <span class="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 text-[11px] font-semibold rounded-full uppercase tracking-wide">
                próximo após sorteio {{ nextSequencia() - 1 }}
              </span>
            } @else {
              <span class="inline-flex items-center px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[11px] font-semibold rounded-full uppercase tracking-wide">
                ★ Primeiro sorteio
              </span>
            }
          </div>

          <div class="p-5">
            <!-- Dados do concurso -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Concurso Mega-Sena</label>
                <input [(ngModel)]="numeroConcurso" name="concurso" type="number" inputmode="numeric"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700 tabular" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Data do sorteio</label>
                <input [(ngModel)]="dataSorteio" name="data" type="date"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Sequência no bolão</label>
                <input [value]="nextSequencia()" type="number" disabled
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm tabular bg-slate-50 text-slate-400 cursor-not-allowed" />
              </div>
            </div>

            <!-- Header do picker -->
            <div class="flex items-center justify-between mb-3">
              <label class="text-xs font-semibold text-slate-500 tracking-wide">
                Bolas sorteadas · clique para selecionar 6 números
              </label>
              <span class="font-mono text-[12px]"
                    [class]="bolasSelected().length === 6 ? 'text-green-700 font-bold' : 'text-slate-400'">
                {{ bolasSelected().length }}/6 selecionadas
              </span>
            </div>

            <!-- Grid de 60 bolas -->
            <div class="grid grid-cols-10 gap-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
              @for (n of nums60; track n) {
                <button type="button" (click)="toggleBola(n)"
                        class="aspect-square rounded-full flex items-center justify-center font-mono font-semibold text-[12px] border transition-all duration-100"
                        [class]="bolaClass(n)">
                  {{ pad(n) }}
                </button>
              }
            </div>

            <!-- Resumo bolas selecionadas -->
            <div class="mt-5 p-4 rounded-xl flex items-center justify-between"
                 [class]="bolasSelected().length === 6 ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'">
              <div>
                <div class="text-[12px] font-semibold mb-2"
                     [class]="bolasSelected().length === 6 ? 'text-green-900' : 'text-slate-500'">
                  {{ bolasSelected().length === 6 ? 'Bolas selecionadas em ordem crescente' : 'Selecione as 6 bolas' }}
                </div>
                <div class="flex gap-2 flex-wrap">
                  @if (bolasSelected().length > 0) {
                    @for (n of bolasOrdenadas(); track n) {
                      <span class="w-9 h-9 rounded-full flex items-center justify-center font-mono font-semibold text-[13px] bg-green-700 text-white shadow-sm">
                        {{ pad(n) }}
                      </span>
                    }
                  } @else {
                    <span class="text-slate-400 text-[12px]">nenhuma selecionada</span>
                  }
                </div>
              </div>
              @if (bolasSelected().length === 6) {
                <div class="text-green-700 text-2xl flex-shrink-0">✓</div>
              }
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <aside class="flex flex-col gap-4" style="position: sticky; top: 72px; align-self: start">

          <!-- Sorteios anteriores -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">Sorteios anteriores</h3>
            </div>
            <div class="p-4 flex flex-col gap-3">
              @if (loadingSorteios()) {
                @for (i of [1,2,3]; track i) {
                  <div class="p-3 border border-slate-100 rounded-[10px]">
                    <div class="h-3 bg-slate-100 rounded animate-pulse w-1/2 mb-2"></div>
                    <div class="h-3 bg-slate-100 rounded animate-pulse w-3/4"></div>
                  </div>
                }
              } @else if (sorteiosAnteriores().length === 0) {
                <div class="text-slate-400 text-[12.5px] text-center py-3">
                  Nenhum sorteio registrado ainda.
                </div>
              } @else {
                @for (s of sorteiosAnteriores(); track s.id) {
                  <div class="p-3 border border-slate-200 rounded-[10px]">
                    <div class="flex items-center justify-between mb-2">
                      <span class="font-mono font-semibold text-[12.5px]">#{{ s.numeroConcurso }}</span>
                      <span class="text-slate-400 text-[11.5px]">{{ formatDate(s.dataSorteio) }}</span>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      @for (n of s.bolasSorteadas; track n) {
                        <span class="w-7 h-7 rounded-full flex items-center justify-center font-mono font-semibold text-[10.5px] bg-green-700 text-white">
                          {{ pad(n) }}
                        </span>
                      }
                    </div>
                    @if (s.processado) {
                      <div class="mt-2 text-[10.5px] text-green-700 font-semibold">✓ Acertos calculados</div>
                    } @else {
                      <div class="mt-2 text-[10.5px] text-amber-600 font-semibold">⟳ Calculando acertos...</div>
                    }
                  </div>
                }
              }
            </div>
          </div>

          <!-- Aviso encerramento automático -->
          <div class="p-3.5 bg-amber-50 border border-amber-100 rounded-lg flex gap-2.5">
            <span class="text-amber-600 flex-shrink-0 text-sm mt-0.5">⚡</span>
            <p class="text-[12px] text-amber-800 leading-relaxed">
              <strong>Encerramento automático:</strong> se alguma cota atingir 10 acertos acumulados, o bolão será finalizado e os prêmios calculados.
            </p>
          </div>

          <!-- Info BullMQ -->
          <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex gap-2.5">
            <span class="text-slate-400 flex-shrink-0 text-sm mt-0.5">ℹ</span>
            <p class="text-[12px] text-slate-600 leading-relaxed">
              O cálculo de acertos é assíncrono via <strong>BullMQ</strong>. Após registrar, as pontuações são atualizadas em segundo plano.
            </p>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class RegistrarSorteioComponent implements OnInit {
  readonly id = input<string>('');

  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);

  // ── Form state ────────────────────────────────────────────────────────────────
  numeroConcurso  = 0;
  dataSorteio     = '';
  bolasSelected   = signal<number[]>([]);

  // ── Async state ───────────────────────────────────────────────────────────────
  sorteiosAnteriores = signal<SorteioResponse[]>([]);
  loadingSorteios    = signal(false);
  loading            = signal(false);
  error              = signal('');
  sucesso            = signal(false);

  // ── Computed ──────────────────────────────────────────────────────────────────
  valido        = computed(() => this.bolasSelected().length === 6);
  bolasOrdenadas = computed(() => [...this.bolasSelected()].sort((a, b) => a - b));
  nextSequencia  = computed(() => this.sorteiosAnteriores().length + 1);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  readonly nums60 = Array.from({ length: 60 }, (_, i) => i + 1);

  constructor() {
    effect(() => {
      const bolaoId = this.id();
      if (bolaoId) this.loadSorteios();
    });
  }

  ngOnInit(): void {
    if (!this.id()) this.loadSorteios();
    // Pré-preencher data de hoje
    this.dataSorteio = new Date().toISOString().split('T')[0];
  }

  private get bolaoId(): string {
    return this.id() || '00000000-0000-0000-0000-000000000002';
  }

  // ── Data ──────────────────────────────────────────────────────────────────────
  async loadSorteios(): Promise<void> {
    this.loadingSorteios.set(true);
    try {
      const res = await firstValueFrom(
        this.api.get<SorteioResponse[]>(`/boloes/${this.bolaoId}/sorteios`),
      );
      this.sorteiosAnteriores.set(res.reverse()); // mais recentes primeiro
      // Sugerir próximo número de concurso
      if (res.length > 0) {
        this.numeroConcurso = res[0].numeroConcurso + 1;
      }
    } catch {
      // Silencia — sidebar não é crítico
    } finally {
      this.loadingSorteios.set(false);
    }
  }

  // ── Picker ────────────────────────────────────────────────────────────────────
  toggleBola(n: number): void {
    this.bolasSelected.update(b =>
      b.includes(n)
        ? b.filter(x => x !== n)
        : b.length < 6 ? [...b, n] : b,
    );
  }

  bolaClass(n: number): string {
    const selected = this.bolasSelected().includes(n);
    const full     = this.bolasSelected().length >= 6;

    if (selected)  return 'bg-green-700 text-white border-green-700 shadow-sm scale-105';
    if (full)      return 'bg-white text-slate-300 border-slate-200 cursor-not-allowed';
    return 'bg-white text-slate-700 border-slate-200 hover:border-green-400 hover:text-green-700 cursor-pointer';
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    if (!this.valido() || this.loading()) return;

    this.loading.set(true);
    this.error.set('');
    this.sucesso.set(false);

    try {
      await firstValueFrom(
        this.api.post(`/boloes/${this.bolaoId}/sorteios`, {
          numeroConcurso:  this.numeroConcurso,
          dataSorteio:     this.dataSorteio,
          bolasSorteadas:  this.bolasOrdenadas(),
        }),
      );

      this.sucesso.set(true);
      this.bolasSelected.set([]);

      // Recarrega lista de sorteios para atualizar sidebar
      await this.loadSorteios();

      // Auto-redirect após 3s
      setTimeout(() => this.router.navigate(['/dashboard']), 3000);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message
        ?? 'Erro ao registrar sorteio. Verifique os dados e tente novamente.';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Formatting ────────────────────────────────────────────────────────────────
  pad(n: number): string { return String(n).padStart(2, '0'); }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch { return iso; }
  }
}
