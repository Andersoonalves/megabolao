import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

interface ResultadoCaixa {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

@Component({
  selector: 'nb-resultados-mega',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 text-[12.5px] min-w-0 truncate">
          <span class="text-slate-400 shrink-0">Mega-Sena</span>
          <span class="text-slate-300 shrink-0">›</span>
          <span class="font-semibold truncate">Últimos resultados</span>
        </div>
      </div>
      <button (click)="atualizar()"
              [disabled]="loading()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1F4E79] hover:bg-[#2E75B6] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm">
        {{ loading() ? 'Buscando…' : '🔄 Atualizar' }}
      </button>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7 max-w-[860px]">
      <div class="mb-6">
        <h1 class="font-display text-[26px] font-semibold tracking-tight mb-1">Últimos resultados da Mega-Sena</h1>
        <p class="text-slate-500 text-[13.5px]">Dados buscados diretamente da Caixa Econômica Federal.</p>
      </div>

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <span>⚠</span> {{ error() }}
        </div>
      }

      @if (loading() && resultados().length === 0) {
        <!-- Skeleton -->
        <div class="flex flex-col gap-3">
          @for (i of skeleton; track i) {
            <div class="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div class="flex items-center justify-between mb-3">
                <div class="h-4 bg-slate-100 rounded w-24"></div>
                <div class="h-3 bg-slate-100 rounded w-20"></div>
              </div>
              <div class="flex gap-2">
                @for (j of [1,2,3,4,5,6]; track j) {
                  <div class="w-10 h-10 rounded-full bg-slate-100"></div>
                }
              </div>
            </div>
          }
        </div>
      } @else if (resultados().length > 0) {
        <div class="flex flex-col gap-3">
          @for (r of resultados(); track r.numeroConcurso) {
            <div class="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                  <span class="font-display font-bold text-[17px] text-slate-900">#{{ r.numeroConcurso }}</span>
                  @if (r.numeroConcurso === ultimo()) {
                    <span class="text-[10.5px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Último</span>
                  }
                </div>
                <span class="text-[12.5px] text-slate-400 font-medium">{{ fmtDate(r.dataSorteio) }}</span>
              </div>
              <div class="flex gap-2 flex-wrap">
                @for (n of r.bolasSorteadas; track n) {
                  <span class="w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-[13px] bg-green-700 text-white shadow-sm select-none">
                    {{ pad(n) }}
                  </span>
                }
              </div>
            </div>
          }
        </div>
      } @else if (!loading()) {
        <div class="text-center py-16 text-slate-400">
          <div class="text-4xl mb-3">🎱</div>
          <p class="text-[14px]">Clique em Atualizar para buscar os resultados</p>
        </div>
      }
    </div>
  `,
})
export class ResultadosMegaComponent implements OnInit {
  private readonly api       = inject(ApiService);
  private readonly translate = inject(TranslateService);

  loading   = signal(false);
  error     = signal('');
  resultados = signal<ResultadoCaixa[]>([]);
  ultimo    = computed(() => this.resultados()[0]?.numeroConcurso ?? 0);

  readonly skeleton = Array.from({ length: 6 }, (_, i) => i);

  ngOnInit(): void { void this.atualizar(); }

  async atualizar(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.api.get<ResultadoCaixa[]>('/sorteios/mega-sena?ultimos=20'),
      );
      this.resultados.set(Array.isArray(res) ? res : [res]);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message
        ?? 'Não foi possível buscar os resultados da Caixa';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }

  fmtDate(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try { return new Date(iso + 'T12:00:00').toLocaleDateString(loc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  }
}
