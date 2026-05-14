import {
  Component, signal, OnInit, OnDestroy, ChangeDetectionStrategy, inject, output,
} from '@angular/core';
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
  imports: [RouterLink],
  template: `
    @if (pendente(); as r) {
      <div class="mx-4 lg:mx-7 mt-5
                  bg-white border border-[#C25B00]/50 rounded-lg shadow-sm
                  dark:bg-slate-800 dark:border-[#C25B00]/40">

        <!-- Cabeçalho -->
        <div class="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-md bg-[#C25B00]/10 dark:bg-gold-500/10
                        flex items-center justify-center shrink-0 text-base">
              🎱
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-display font-semibold text-[14px] text-[#C25B00] dark:text-gold-400">
                  Novo resultado Mega-Sena
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                             bg-[#C25B00]/10 text-[#C25B00] dark:bg-gold-500/15 dark:text-gold-400">
                  #{{ r.numeroConcurso }}
                </span>
              </div>
              <div class="text-[11.5px] text-[#C25B00]/60 dark:text-gold-500/50 mt-0.5">
                {{ fmtDate(r.dataSorteio) }} · Aguardando aplicação nos bolões em andamento
              </div>
            </div>
          </div>

          <!-- Botão dispensar (X) -->
          <button (click)="dispensar()"
                  [disabled]="loading()"
                  title="Dispensar"
                  class="w-7 h-7 rounded-md flex items-center justify-center shrink-0
                         text-[#C25B00]/40 hover:text-[#C25B00] hover:bg-[#C25B00]/10
                         dark:text-gold-500/40 dark:hover:text-gold-400 dark:hover:bg-gold-500/10
                         transition-colors disabled:opacity-40">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Divider -->
        <div class="mx-4 h-px bg-[#C25B00]/15 dark:bg-[#C25B00]/20"></div>

        <!-- Bolas -->
        <div class="flex items-center gap-2 px-4 py-3 flex-wrap">
          @for (n of r.bolasSorteadas; track n) {
            <div class="w-9 h-9 rounded-full flex items-center justify-center
                        font-mono font-bold text-[12.5px] shadow-sm select-none
                        bg-green-700 text-white
                        dark:bg-green-800">
              {{ pad(n) }}
            </div>
          }
        </div>

        <!-- Divider -->
        <div class="mx-4 h-px bg-[#C25B00]/15 dark:bg-[#C25B00]/20"></div>

        <!-- Ações -->
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <a routerLink="/sorteios"
             class="text-[12px] font-medium text-[#C25B00]/60 hover:text-[#C25B00]
                    dark:text-gold-500/50 dark:hover:text-gold-400
                    transition-colors no-underline">
            Ver configurações →
          </a>

          <div class="flex gap-2">
            <button (click)="aplicar()"
                    [disabled]="loading()"
                    class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md
                           font-semibold text-[13px] transition-colors min-h-10 shadow-sm
                           bg-[#C25B00] hover:bg-[#a84e00] text-white
                           dark:bg-gold-600 dark:hover:bg-gold-700
                           disabled:opacity-50 disabled:cursor-not-allowed">
              @if (loading()) {
                <svg class="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Aplicando…
              } @else {
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Aplicar a todos os bolões
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MegaSenaAlertComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

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

  fmtDate(iso: string): string {
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long',
      });
    } catch { return iso; }
  }
}
