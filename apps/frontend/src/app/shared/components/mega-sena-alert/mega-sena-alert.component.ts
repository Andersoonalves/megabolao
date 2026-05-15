import {
  Component, signal, OnInit, OnDestroy, ChangeDetectionStrategy, inject, input, output,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

interface ResultadoPendente {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

interface CheckPendenteResponse {
  hasPendente: boolean;
  resultado: ResultadoPendente | null;
  autoApply: boolean;
}

@Component({
  selector: 'nb-mega-sena-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgClass],
  template: `
    @if (pendente(); as r) {
      <div
        class="mx-4 lg:mx-7 mt-5 mb-5 rounded-[14px] border border-[#fef3c7] border-l-4 border-l-[#f59e0b]
               bg-gradient-to-br from-white to-[#fffbeb]
               shadow-[0_4px_14px_rgba(217,119,6,0.08)]
               dark:from-slate-900 dark:to-amber-950/40 dark:border-amber-900/50 dark:border-l-amber-500
               dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
        [ngClass]="variant() === 'compact' ? 'px-[18px] py-3.5' : 'px-5 py-4'">

        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <!-- Bloco principal (protótipo NovoSorteioAlert) -->
          <div class="min-w-0 flex-1">
            <div class="mb-1">
              <span
                class="inline-flex items-center gap-1.5 rounded-full bg-[#f59e0b] px-2.5 py-1
                       text-[10.5px] font-bold uppercase tracking-[0.06em] text-white
                       dark:bg-amber-500">
                <span class="text-[12px] leading-none" aria-hidden="true">✨</span>
                Novo sorteio Mega-Sena
              </span>
            </div>
            <div class="font-display text-[15px] font-semibold text-slate-900 dark:text-slate-100 sm:text-base">
              Concurso #{{ r.numeroConcurso }} · {{ fmtDateLinha(r.dataSorteio) }}
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <div class="flex flex-wrap gap-1">
                @for (n of r.bolasSorteadas; track n) {
                  <div
                    class="flex h-7 w-7 select-none items-center justify-center rounded-lg border border-green-700
                           bg-green-700 font-mono text-[11px] font-semibold text-white shadow-sm
                           dark:border-green-600 dark:bg-green-800">
                    {{ pad(n) }}
                  </div>
                }
              </div>
              <span class="hidden text-slate-300 sm:inline dark:text-slate-600" aria-hidden="true">·</span>
              <span class="text-[12px] text-slate-500 dark:text-slate-400">
                Aguardando aplicação nos bolões em andamento
              </span>
            </div>
          </div>

          <!-- Ações -->
          <div class="flex w-full shrink-0 flex-col gap-2 sm:items-end lg:w-auto">
            <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <button (click)="dispensar()"
                      type="button"
                      [disabled]="loading()"
                      class="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200
                             bg-white px-4 text-[13px] font-semibold text-slate-700 transition-colors
                             hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40
                             dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                Lembrar depois
              </button>
              <button (click)="aplicar()"
                      type="button"
                      [disabled]="loading()"
                      class="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#d97706]
                             bg-[#d97706] px-4 text-[13px] font-semibold text-white shadow-sm transition-colors
                             hover:bg-[#b45309] disabled:cursor-not-allowed disabled:opacity-50
                             dark:border-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700">
                @if (loading()) {
                  <svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Aplicando…
                } @else {
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6"/>
                  </svg>
                  Aplicar aos bolões
                }
              </button>
            </div>
            <a routerLink="/mega-sena"
               class="text-center text-[10.5px] font-medium text-slate-500 no-underline transition-colors hover:text-[#b45309]
                      sm:text-right dark:text-slate-500 dark:hover:text-amber-400">
              Ver resultados oficiais →
            </a>
            <div class="text-center text-[10.5px] text-slate-500 sm:text-right dark:text-slate-400">
              <span class="font-semibold text-green-700 dark:text-green-500">●</span>
              Resultado da Caixa disponível — aplique para atualizar acertos nos bolões ativos
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class MegaSenaAlertComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  /** `compact` — padding menor, alinhado ao protótipo na tela Registrar sorteio */
  readonly variant = input<'default' | 'compact'>('default');

  readonly applied = output<void>();

  pendente = signal<ResultadoPendente | null>(null);
  loading  = signal(false);

  private pollInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    void this.check();
    this.pollInterval = setInterval(() => void this.check(), 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async check(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.api.get<CheckPendenteResponse>('/sorteios/mega-sena/pendente'),
      );
      this.pendente.set(res.hasPendente ? res.resultado : null);
    } catch { /* silencioso */ }
  }

  async aplicar(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await firstValueFrom(this.api.post('/sorteios/mega-sena/aplicar', {}));
      this.pendente.set(null);
      this.applied.emit();
    } catch { /* silencioso */ }
    finally { this.loading.set(false); }
  }

  async dispensar(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await firstValueFrom(this.api.post('/sorteios/mega-sena/ignorar', {}));
      this.pendente.set(null);
    } catch { /* silencioso */ }
    finally { this.loading.set(false); }
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }

  /** Ex.: 01/mai/2026 (sáb) — alinhado ao protótipo `NovoSorteioAlert` */
  fmtDateLinha(iso: string): string {
    try {
      const d = new Date(`${iso}T12:00:00`);
      const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      const dd = String(d.getDate()).padStart(2, '0');
      const mon = months[d.getMonth()] ?? '';
      const yyyy = d.getFullYear();
      const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace(/\./g, '').trim();
      return `${dd}/${mon}/${yyyy} (${wd})`;
    } catch {
      return iso;
    }
  }
}
