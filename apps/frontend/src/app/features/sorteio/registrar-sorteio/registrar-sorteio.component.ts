import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { MegaSenaAlertComponent } from '../../../shared/components/mega-sena-alert/mega-sena-alert.component';

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

interface SorteioRecente {
  id: string;
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  processado: boolean;
}

interface RegistroResult {
  bolaoesProcessados: number;
  sorteios: SorteioRecente[];
}

interface ResultadoCaixa {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

@Component({
  selector: 'nb-registrar-sorteio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, TranslatePipe, MegaSenaAlertComponent],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1 flex items-center gap-2">
        <div class="flex items-center gap-2 text-[12.5px] min-w-0 truncate">
          <span class="text-slate-400 shrink-0">{{ 'registrarSorteio.breadcrumb' | translate }}</span>
          <span class="text-slate-300 shrink-0">›</span>
          <span class="font-semibold truncate">{{ 'registrarSorteio.breadcrumbAction' | translate }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button (click)="submit()"
                [disabled]="!valido() || loading()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm">
          {{ loading() ? ('registrarSorteio.submitting' | translate) : ('registrarSorteio.submit' | translate) }}
        </button>
      </div>
    </div>

    <!-- Alerta resultado pendente (componente compartilhado) -->
    <nb-mega-sena-alert (applied)="loadRecentes()" />

    <!-- Page -->
    <div class="p-4 lg:p-7 max-w-[1100px]">
      <div class="mb-6">
        <h1 class="font-display text-[26px] font-semibold tracking-tight mb-1">{{ 'registrarSorteio.title' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px]">
          {{ 'registrarSorteio.subtitle1' | translate }}<strong>{{ 'registrarSorteio.subtitleBold' | translate }}</strong>{{ 'registrarSorteio.subtitle2' | translate }}
        </p>
      </div>

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <span>⚠</span> {{ error() }}
        </div>
      }

      @if (sucesso()) {
        <div class="mb-5 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <span>✓</span>
            <strong>{{ 'registrarSorteio.successTitle' | translate:{ n: ultimoConcurso() } }}</strong>
            {{ 'registrarSorteio.successJob' | translate:{ b: ultimosBoloes() } }}
          </div>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        <!-- Formulário -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200">
            <h3 class="font-display font-semibold text-[15px]">{{ 'registrarSorteio.cardTitle' | translate }}</h3>
          </div>

          <!-- Buscar da Caixa -->
          @if (previewCaixa()) {
            <div class="mx-5 mt-5 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start justify-between gap-3">
              <div>
                <div class="text-[11.5px] font-semibold text-blue-800 mb-1">Resultado da Caixa — Concurso #{{ previewCaixa()!.numeroConcurso }}</div>
                <div class="flex gap-1.5 flex-wrap">
                  @for (n of previewCaixa()!.bolasSorteadas; track n) {
                    <span class="w-8 h-8 rounded-full flex items-center justify-center font-mono font-semibold text-[12px] bg-blue-700 text-white shadow-sm">{{ pad(n) }}</span>
                  }
                </div>
                <div class="text-[11px] text-blue-600 mt-1.5">{{ fmtDate(previewCaixa()!.dataSorteio) }}</div>
              </div>
              <div class="flex flex-col gap-2 shrink-0">
                <button type="button" (click)="confirmarCaixa()"
                        class="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors">
                  Usar este resultado
                </button>
                <button type="button" (click)="previewCaixa.set(null)"
                        class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          }

          <div class="p-5">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'registrarSorteio.numConcurso' | translate }} <span class="text-red-500">*</span>
                </label>
                <div class="flex gap-2">
                  <input [ngModel]="numeroConcurso()" (ngModelChange)="numeroConcurso.set(+$event)"
                         name="concurso" type="number" inputmode="numeric" min="1"
                         class="flex-1 min-w-0 px-3 py-2.5 border rounded-[10px] text-sm font-mono focus:outline-none tabular"
                         [class]="numeroConcurso() > 0 ? 'border-slate-200 focus:border-green-700' : 'border-red-300 bg-red-50'"
                         [placeholder]="'registrarSorteio.numPh' | translate" />
                  <button type="button" (click)="buscarCaixa()"
                          [disabled]="loadingCaixa()"
                          title="Buscar resultado na Caixa"
                          class="shrink-0 px-3 py-2 bg-[#1F4E79] hover:bg-[#2E75B6] disabled:opacity-50 text-white text-xs font-semibold rounded-[10px] transition-colors whitespace-nowrap">
                    {{ loadingCaixa() ? '…' : '🔍 Caixa' }}
                  </button>
                </div>
                @if (numeroConcurso() === 0) {
                  <p class="text-[11px] text-red-600 mt-1">{{ 'registrarSorteio.numRequired' | translate }}</p>
                }
                @if (erroCaixa()) {
                  <p class="text-[11px] text-red-600 mt-1">{{ erroCaixa() }}</p>
                }
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'registrarSorteio.dataSorteio' | translate }}</label>
                <input [ngModel]="dataSorteio()" (ngModelChange)="dataSorteio.set($event)"
                       name="data" type="date"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700" />
              </div>
            </div>

            <!-- Picker bolas -->
            <div class="flex items-center justify-between mb-3">
              <label class="text-xs font-semibold text-slate-500 tracking-wide">
                {{ 'registrarSorteio.bolasLabel' | translate }}
              </label>
              <span class="font-mono text-[12px]"
                    [class]="bolasSelected().length === 6 ? 'text-green-700 font-bold' : 'text-slate-400'">
                {{ bolasSelected().length }}/6
              </span>
            </div>

            <div class="grid grid-cols-10 gap-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
              @for (n of nums60; track n) {
                <button type="button" (click)="toggleBola(n)"
                        class="aspect-square rounded-full flex items-center justify-center font-mono font-semibold text-[12px] border transition-all duration-100"
                        [class]="bolaClass(n)">
                  {{ pad(n) }}
                </button>
              }
            </div>

            <!-- Resumo -->
            <div class="mt-5 p-4 rounded-xl flex items-center justify-between"
                 [class]="bolasSelected().length === 6 ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'">
              <div>
                <div class="text-[12px] font-semibold mb-2"
                     [class]="bolasSelected().length === 6 ? 'text-green-900' : 'text-slate-500'">
                  {{ bolasSelected().length === 6 ? ('registrarSorteio.ballsOrdered' | translate) : ('registrarSorteio.ballsPickSix' | translate) }}
                </div>
                <div class="flex gap-2 flex-wrap">
                  @if (bolasSelected().length > 0) {
                    @for (n of bolasOrdenadas(); track n) {
                      <span class="w-9 h-9 rounded-full flex items-center justify-center font-mono font-semibold text-[13px] bg-green-700 text-white shadow-sm">
                        {{ pad(n) }}
                      </span>
                    }
                  } @else {
                    <span class="text-slate-400 text-[12px]">{{ 'registrarSorteio.noneSelected' | translate }}</span>
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

          <!-- Concursos recentes -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">{{ 'registrarSorteio.recentTitle' | translate }}</h3>
            </div>
            <div class="p-4 flex flex-col gap-3">
              @if (loadingRecentes()) {
                @for (i of [1,2,3]; track i) {
                  <div class="p-3 border border-slate-100 rounded-[10px] animate-pulse">
                    <div class="h-3 bg-slate-100 rounded w-1/2 mb-2"></div>
                    <div class="h-3 bg-slate-100 rounded w-3/4"></div>
                  </div>
                }
              } @else if (recentes().length === 0) {
                <p class="text-slate-400 text-[12.5px] text-center py-3">{{ 'registrarSorteio.recentEmpty' | translate }}</p>
              } @else {
                @for (s of recentes(); track s.id) {
                  <div class="p-3 border border-slate-200 rounded-[10px]">
                    <div class="flex items-center justify-between mb-2">
                      <span class="font-mono font-semibold text-[12.5px]">#{{ s.numeroConcurso }}</span>
                      <span class="text-slate-400 text-[11.5px]">{{ fmtDate(s.dataSorteio) }}</span>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      @for (n of s.bolasSorteadas; track n) {
                        <span class="w-7 h-7 rounded-full flex items-center justify-center font-mono font-semibold text-[10.5px] bg-green-700 text-white">
                          {{ pad(n) }}
                        </span>
                      }
                    </div>
                    @if (s.processado) {
                      <div class="mt-2 text-[10.5px] text-green-700 font-semibold">{{ 'registrarSorteio.processedOk' | translate }}</div>
                    } @else {
                      <div class="mt-2 text-[10.5px] text-amber-600 font-semibold">{{ 'registrarSorteio.processing' | translate }}</div>
                    }
                  </div>
                }
              }
            </div>
          </div>

          <div class="p-3.5 bg-amber-50 border border-amber-100 rounded-lg flex gap-2.5">
            <span class="text-amber-600 flex-shrink-0 text-sm mt-0.5">⚡</span>
            <p class="text-[12px] text-amber-800 leading-relaxed">
              <strong>{{ 'registrarSorteio.tipTitle' | translate }}</strong> {{ 'registrarSorteio.tipBody' | translate }}
            </p>
          </div>

          <!-- Config auto-apply -->
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <h3 class="font-display font-semibold text-[14px] mb-3 flex items-center gap-2">
              ⚙ Automação
            </h3>
            <label class="flex items-start gap-3 cursor-pointer">
              <div class="relative mt-0.5">
                <input type="checkbox"
                       [checked]="autoApply()"
                       (change)="toggleAutoApply($event)"
                       class="sr-only" />
                <div class="w-10 h-6 rounded-full transition-colors"
                     [class]="autoApply() ? 'bg-green-700' : 'bg-slate-200'">
                  <div class="w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform"
                       [class]="autoApply() ? 'translate-x-5 ml-0.5' : 'translate-x-1'"></div>
                </div>
              </div>
              <div>
                <div class="text-[13px] font-semibold text-slate-800">Aplicar resultado automaticamente</div>
                <div class="text-[11.5px] text-slate-500 mt-0.5">
                  Quando houver resultado novo, aplica em todos os bolões em andamento sem confirmação manual
                </div>
              </div>
            </label>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class RegistrarSorteioComponent implements OnInit {
  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  numeroConcurso = signal(0);
  dataSorteio    = signal(new Date().toISOString().split('T')[0]);
  bolasSelected  = signal<number[]>([]);

  recentes       = signal<SorteioRecente[]>([]);
  loadingRecentes = signal(false);
  loading        = signal(false);
  error          = signal('');
  sucesso        = signal(false);
  ultimoConcurso = signal(0);
  ultimosBoloes  = signal(0);

  loadingCaixa  = signal(false);
  erroCaixa     = signal('');
  previewCaixa  = signal<ResultadoCaixa | null>(null);

  pendente       = signal<ResultadoPendente | null>(null);
  autoApply      = signal(false);
  loadingPendente = signal(false);

  valido        = computed(() => this.bolasSelected().length === 6 && this.numeroConcurso() > 0);
  bolasOrdenadas = computed(() => [...this.bolasSelected()].sort((a, b) => a - b));
  readonly nums60 = Array.from({ length: 60 }, (_, i) => i + 1);

  ngOnInit(): void {
    this.loadRecentes();
    void this.checkPendente();
  }

  private async checkPendente(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.get<CheckPendenteResponse>('/sorteios/mega-sena/pendente'));
      this.pendente.set(res.hasPendente ? res.resultado : null);
      this.autoApply.set(res.autoApply);
    } catch { /* silencioso */ }
  }

  async aplicarPendente(): Promise<void> {
    if (this.loadingPendente()) return;
    this.loadingPendente.set(true);
    try {
      await firstValueFrom(this.api.post('/sorteios/mega-sena/aplicar', {}));
      this.pendente.set(null);
      await this.loadRecentes();
      this.sucesso.set(true);
      this.ultimoConcurso.set(this.pendente()?.numeroConcurso ?? 0);
    } catch (err: unknown) {
      this.error.set((err as { error?: { message?: string } })?.error?.message ?? 'Erro ao aplicar resultado');
    } finally {
      this.loadingPendente.set(false);
    }
  }

  async ignorarPendente(): Promise<void> {
    if (this.loadingPendente()) return;
    this.loadingPendente.set(true);
    try {
      await firstValueFrom(this.api.post('/sorteios/mega-sena/ignorar', {}));
      this.pendente.set(null);
    } catch { /* silencioso */ }
    finally { this.loadingPendente.set(false); }
  }

  async toggleAutoApply(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    try {
      await firstValueFrom(this.api.patch('/sorteios/mega-sena/config', { autoApply: checked }));
      this.autoApply.set(checked);
    } catch { this.autoApply.set(!checked); } // reverte se falhar
  }

  async loadRecentes(): Promise<void> {
    this.loadingRecentes.set(true);
    try {
      const res = await firstValueFrom(this.api.get<SorteioRecente[]>('/sorteios/recentes'));
      this.recentes.set(res);
      if (res.length > 0) this.numeroConcurso.set(res[0].numeroConcurso + 1);
    } catch { /* silencioso */ }
    finally { this.loadingRecentes.set(false); }
  }

  toggleBola(n: number): void {
    this.bolasSelected.update(b =>
      b.includes(n) ? b.filter(x => x !== n) : b.length < 6 ? [...b, n] : b,
    );
  }

  bolaClass(n: number): string {
    const sel  = this.bolasSelected().includes(n);
    const full = this.bolasSelected().length >= 6;
    if (sel)  return 'bg-green-700 text-white border-green-700 shadow-sm scale-105';
    if (full) return 'bg-white text-slate-300 border-slate-200 cursor-not-allowed';
    return 'bg-white text-slate-700 border-slate-200 hover:border-green-400 hover:text-green-700 cursor-pointer';
  }

  async submit(): Promise<void> {
    if (!this.valido() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.sucesso.set(false);
    try {
      const res = await firstValueFrom(
        this.api.post<RegistroResult>('/sorteios', {
          numeroConcurso: this.numeroConcurso(),
          dataSorteio:    this.dataSorteio(),
          bolasSorteadas: this.bolasOrdenadas(),
        }),
      );
      this.ultimoConcurso.set(this.numeroConcurso());
      this.ultimosBoloes.set(res.bolaoesProcessados);
      this.sucesso.set(true);
      this.bolasSelected.set([]);
      await this.loadRecentes();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message
        ?? this.translate.instant('errors.registerDraw');
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async buscarCaixa(): Promise<void> {
    if (this.loadingCaixa()) return;
    this.loadingCaixa.set(true);
    this.erroCaixa.set('');
    this.previewCaixa.set(null);
    try {
      const params = this.numeroConcurso() > 0 ? `?concurso=${this.numeroConcurso()}` : '';
      const res = await firstValueFrom(this.api.get<ResultadoCaixa>(`/sorteios/mega-sena${params}`));
      this.previewCaixa.set(res);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao buscar resultado na Caixa';
      this.erroCaixa.set(msg);
    } finally {
      this.loadingCaixa.set(false);
    }
  }

  confirmarCaixa(): void {
    const p = this.previewCaixa();
    if (!p) return;
    this.numeroConcurso.set(p.numeroConcurso);
    this.dataSorteio.set(p.dataSorteio);
    this.bolasSelected.set(p.bolasSorteadas);
    this.previewCaixa.set(null);
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }
  fmtDate(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try { return new Date(iso).toLocaleDateString(loc, { day: '2-digit', month: 'short' }); }
    catch { return iso; }
  }
}
