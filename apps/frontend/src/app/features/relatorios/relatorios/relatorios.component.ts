import {
  Component, signal, ChangeDetectionStrategy, inject,
  Pipe, PipeTransform,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

@Pipe({ name: 'rBrl', standalone: true, pure: true })
export class RBrlPipe implements PipeTransform {
  transform(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
}

interface RelatorioResult { url: string; caminho: string; geradoEm: string; }

// Demo bolão — substituir por seletor quando multi-bolão
const DEMO_BOLAO_ID = '00000000-0000-0000-0000-000000000002';

@Component({
  selector: 'nb-relatorios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RBrlPipe, TranslatePipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1 flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-2 text-[12.5px] min-w-0">
          <span class="text-slate-400">{{ 'relatorios.brand' | translate }}</span>
          <span class="text-slate-300">›</span>
          <span class="font-semibold">{{ 'relatorios.title' | translate }}</span>
        </div>
        <span class="font-display font-semibold text-[14px] sm:hidden truncate">{{ 'relatorios.title' | translate }}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <button (click)="gerarXlsx()" [disabled]="gerandoXlsx()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-sm font-semibold rounded-[10px] text-slate-700 transition-colors min-h-9">
          {{ gerandoXlsx() ? ('relatorios.genXlsx' | translate) : ('relatorios.downloadXlsx' | translate) }}
        </button>
        <button (click)="gerarPdf()" [disabled]="gerandoPdf()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9">
          {{ gerandoPdf() ? ('relatorios.genPdf' | translate) : ('relatorios.exportPdf' | translate) }}
        </button>
      </div>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">{{ 'relatorios.title' | translate }}</h1>
          <p class="text-slate-500 text-[13.5px]">{{ 'relatorios.subtitleDemo' | translate }}</p>
        </div>
      </div>

      @if (urlXlsx() || urlPdf()) {
        <div class="mb-5 p-3.5 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 flex-wrap">
          <span class="text-green-700">✓</span>
          <span class="text-sm text-green-900 font-semibold">{{ 'relatorios.successBanner' | translate }}</span>
          @if (urlXlsx()) {
            <a [href]="urlXlsx()" target="_blank" rel="noopener"
               class="ml-auto text-sm text-green-700 font-semibold no-underline hover:underline">
              {{ 'relatorios.linkXlsx' | translate }}
            </a>
          }
          @if (urlPdf()) {
            <a [href]="urlPdf()" target="_blank" rel="noopener"
               class="text-sm text-green-700 font-semibold no-underline hover:underline">
              {{ 'relatorios.linkPdf' | translate }}
            </a>
          }
        </div>
      }

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ error() }}</div>
      }

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'relatorios.kpiTotalRaised' | translate }}</div>
          <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular text-amber-600">{{ 184880 | rBrl }}</div>
          <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'relatorios.kpiTotalRaisedHint' | translate }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'relatorios.kpiTotalPaid' | translate }}</div>
          <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular">{{ 174624 | rBrl }}</div>
          <div class="text-[11.5px] text-green-700 mt-0.5">{{ 'relatorios.kpiTotalPaidHint' | translate }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'relatorios.kpiPending' | translate }}</div>
          <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular text-amber-600">{{ 12380 | rBrl }}</div>
          <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'relatorios.kpiPendingHint' | translate }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'relatorios.kpiMargin' | translate }}</div>
          <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular text-blue-600">{{ 10256 | rBrl }}</div>
          <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'relatorios.kpiMarginHint' | translate }}</div>
        </div>
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        <!-- Distribuição por categoria -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200">
            <h3 class="font-display font-semibold text-[15px]">{{ 'relatorios.chartByCategory' | translate }}</h3>
          </div>
          <div class="p-5 flex flex-col gap-4">
            @for (r of distribuicao; track r.cat) {
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[12.5px] font-semibold">{{ r.cat }}</span>
                  <span class="font-mono text-[12.5px] tabular">{{ r.v | rBrl }} <span class="text-slate-400 text-[11px]">· {{ r.p }}%</span></span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500"
                         [style.width]="r.p + '%'"
                         [style.background]="r.color"></div>
                  </div>
                  <span class="font-mono text-[11px] text-slate-400 text-right w-16 tabular">{{ 'relatorios.winnersShort' | translate: { n: r.n } }}</span>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Acertos por sorteio (bar chart) -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200">
            <h3 class="font-display font-semibold text-[15px]">{{ 'relatorios.chartHits' | translate }}</h3>
          </div>
          <div class="p-5">
            <div class="flex items-end gap-3 h-44">
              @for (b of sorteiosBars; track b.c) {
                <div class="flex-1 flex flex-col items-center gap-1.5">
                  <span class="font-mono text-[10.5px] text-slate-400 tabular">{{ b.l }}</span>
                  <div class="w-full rounded-t-[4px] transition-all duration-500"
                       [style.height]="(b.h * 18) + 'px'"
                       style="background: linear-gradient(180deg, #10b981, #047857)"></div>
                  <span class="font-mono text-[10px] text-slate-400">{{ b.c }}</span>
                </div>
              }
            </div>
            <p class="text-[11.5px] text-slate-400 text-center mt-3">{{ 'relatorios.chartHitsCaption' | translate }}</p>
          </div>
        </div>
      </div>

      <!-- Ranking final -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-display font-semibold text-[15px]">{{ 'relatorios.rankingTitle' | translate }}</h3>
          <button class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold rounded-[10px] text-slate-700 transition-colors">
            {{ 'relatorios.exportCsv' | translate }}
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 w-12">{{ 'relatorios.thNum' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'relatorios.thParticipant' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden sm:table-cell">{{ 'relatorios.thQuota' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'relatorios.thHits' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden md:table-cell">{{ 'relatorios.thCategory' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'relatorios.thPrize' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden lg:table-cell">{{ 'relatorios.thStatus' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of ranking; track r.p) {
                <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                  <td class="px-4 py-3">
                    <span class="w-7 h-7 rounded-full inline-flex items-center justify-center text-[11.5px] font-bold"
                          [class]="r.p <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'">
                      {{ r.p }}
                    </span>
                  </td>
                  <td class="px-4 py-3 font-semibold">{{ r.n }}</td>
                  <td class="px-4 py-3 font-mono text-slate-400 text-[12px] hidden sm:table-cell">{{ r.c }}</td>
                  <td class="px-4 py-3 font-mono font-bold tabular">{{ r.a }}</td>
                  <td class="px-4 py-3 hidden md:table-cell">
                    <span class="inline-flex items-center px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded uppercase tracking-wide">{{ r.cat }}</span>
                  </td>
                  <td class="px-4 py-3 font-mono font-semibold tabular text-amber-700">{{ r.v | rBrl }}</td>
                  <td class="px-4 py-3 hidden lg:table-cell">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border"
                          [class]="r.s === 'PAGO' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-100'">
                      <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                      @switch (r.s) {
                        @case ('PAGO') { {{ 'relatorios.badgePAGO' | translate }} }
                        @case ('A_PAGAR') { {{ 'relatorios.badgeAPAGAR' | translate }} }
                        @default { {{ r.s }} }
                      }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class RelatoriosComponent {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  gerandoXlsx = signal(false);
  gerandoPdf  = signal(false);
  urlXlsx     = signal('');
  urlPdf      = signal('');
  error       = signal('');

  async gerarXlsx(): Promise<void> {
    this.gerandoXlsx.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.post<RelatorioResult>(`/boloes/${DEMO_BOLAO_ID}/relatorios/xlsx`, {}));
      this.urlXlsx.set(res.url);
      window.open(res.url, '_blank');
    } catch { this.error.set(this.translate.instant('relatorios.errXlsx')); }
    finally { this.gerandoXlsx.set(false); }
  }

  async gerarPdf(): Promise<void> {
    this.gerandoPdf.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.post<RelatorioResult>(`/boloes/${DEMO_BOLAO_ID}/relatorios/pdf`, {}));
      this.urlPdf.set(res.url);
      window.open(res.url, '_blank');
    } catch { this.error.set(this.translate.instant('relatorios.errPdf')); }
    finally { this.gerandoPdf.set(false); }
  }

  readonly distribuicao = [
    { cat: '09 acertos — Mais Pontos', v: 18488,  p: 10, n: 22,   color: '#f59e0b' },
    { cat: '08 acertos',               v: 56400,  p: 28, n: 47,   color: '#fbbf24' },
    { cat: '07 acertos',               v: 64200,  p: 30, n: 312,  color: '#2563eb' },
    { cat: '06 acertos',               v: 35536,  p: 18, n: 1240, color: '#94a3b8' },
    { cat: 'Acumulado p/ próximo',     v: 2256,   p:  2, n: 0,    color: '#cbd5e1' },
    { cat: 'Taxa administrativa',      v: 27732,  p: 15, n: 0,    color: '#f1f5f9' },
  ];

  readonly sorteiosBars = [
    { c: 2989, h: 1.2, l: '1,2k' }, { c: 2990, h: 2.6, l: '2,6k' },
    { c: 2991, h: 3.4, l: '3,4k' }, { c: 2992, h: 4.1, l: '4,1k' },
    { c: 2993, h: 5.5, l: '5,5k' }, { c: 2994, h: 7.2, l: '7,2k' },
  ];

  readonly ranking = [
    { p: 1, n: 'Maria L. Souza',       c: '#4164', a: 9, cat: '09 pts',   v: 840.36,  s: 'PAGO'    },
    { p: 2, n: 'João R. Oliveira',     c: '#2871', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 3, n: 'Ana P. Carvalho',      c: '#0931', a: 8, cat: '08 acertos', v: 1200.00, s: 'A_PAGAR' },
    { p: 4, n: 'Carlos H. Lima',       c: '#5502', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 5, n: 'Roberto F. Andrade',   c: '#1148', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 6, n: 'Fernanda K. Yamada',   c: '#7723', a: 8, cat: '08 acertos', v: 1200.00, s: 'A_PAGAR' },
    { p: 7, n: 'Lucas M. Pereira',     c: '#3290', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
    { p: 8, n: 'Beatriz N. Costa',     c: '#6601', a: 8, cat: '08 acertos', v: 1200.00, s: 'PAGO'    },
  ];
}
