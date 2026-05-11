import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PortalApiService, PortalBolao, PortalCota, PortalSorteio } from '../portal-api.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BolaoData {
  bolao: PortalBolao;
  cotas: PortalCota[];
  sorteios: PortalSorteio[];
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-portal-cotas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink],
  template: `
    <!-- Header verde (saudação e idioma ficam no portal-shell) -->
    <div style="background: linear-gradient(180deg, #065f46, #1a4436)" class="text-white">
      <div class="flex gap-3 px-4 pt-4 pb-5">
        <div class="flex-1 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5">
          <div class="text-[10px] text-white/60 uppercase tracking-wider">{{ 'portalCotas.statQuotas' | translate }}</div>
          <div class="font-display text-[20px] font-semibold">{{ totalCotas() }}</div>
        </div>
        <div class="flex-1 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5">
          <div class="text-[10px] text-white/60 uppercase tracking-wider">{{ 'portalCotas.statBest' | translate }}</div>
          <div class="font-display text-[20px] font-semibold">{{ melhorAcertos() }}<span class="text-sm font-normal text-white/70">{{ 'portalCotas.statHitsShort' | translate }}</span></div>
        </div>
        @if (totalPremio() > 0) {
          <div class="flex-1 rounded-xl px-3 py-2.5" style="background: #f59e0b">
            <div class="text-[10px] text-white/80 uppercase tracking-wider">{{ 'portalCotas.statPrize' | translate }}</div>
            <div class="font-display text-[16px] font-semibold">{{ fmtBrl(totalPremio()) }}</div>
          </div>
        } @else {
          <div class="flex-1 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2.5">
            <div class="text-[10px] text-white/60 uppercase tracking-wider">{{ 'portalCotas.statPosition' | translate }}</div>
            <div class="font-display text-[20px] font-semibold">{{ melhorPosicao() > 0 ? melhorPosicao() + 'º' : '—' }}</div>
          </div>
        }
      </div>
    </div>

    <!-- Conteúdo ──────────────────────────────────────────────────────────── -->
    <div class="px-4 py-5 flex flex-col gap-4">

      @if (loading()) {
        @for (i of [1, 2]; track i) {
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div class="h-5 w-2/3 max-w-xs bg-slate-100 rounded animate-pulse"></div>
            <div class="h-4 w-40 bg-slate-100 rounded mt-3 animate-pulse"></div>
          </div>
        }
      } @else if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          ⚠ {{ error() }}
        </div>
      } @else if (boloesData().length === 0) {
        <div class="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div class="text-3xl mb-3">🎫</div>
          <p class="text-slate-500 text-sm">{{ 'portalCotas.emptyError' | translate }}</p>
          <p class="text-slate-400 text-xs mt-1">{{ 'portalCotas.emptyHint' | translate }}</p>
        </div>
      } @else {
        @for (bd of boloesData(); track bd.bolao.id) {
          <a
            [routerLink]="['/portal/boloes', bd.bolao.id]"
            class="block bg-white rounded-2xl p-4 shadow-sm border border-slate-100 no-underline text-inherit hover:border-green-300 hover:shadow-md transition-all min-h-12"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="font-display font-semibold text-[15px] text-slate-900">{{ bd.bolao.nome }}</div>
                <div class="text-[12px] text-slate-500 mt-1.5 leading-snug">
                  @if (bd.cotas.length === 1) {
                    {{ 'portalCotas.quotaSingle' | translate }}
                  } @else {
                    {{ 'portalCotas.quotaMany' | translate:{ n: bd.cotas.length } }}
                  }
                  <span class="text-slate-300"> · </span>
                  {{ bd.sorteios.length }}
                  {{ 'portalCotas.draws' | translate }}
                </div>
              </div>
              <span class="text-green-700 text-[13px] font-semibold shrink-0 pt-0.5">
                {{ 'portalBolaoDetalhe.open' | translate }}
              </span>
            </div>
          </a>
        }
      }
    </div>
  `,
})
export class PortalCotasComponent implements OnInit {
  private readonly portalApi = inject(PortalApiService);
  private readonly translate = inject(TranslateService);

  boloesData = signal<BolaoData[]>([]);
  loading    = signal(false);
  error      = signal('');

  // Computed
  totalCotas    = computed(() => this.boloesData().reduce((s, b) => s + b.cotas.length, 0));
  melhorAcertos = computed(() => Math.max(0, ...this.boloesData().flatMap(b => b.cotas.map(c => c.totalAcertosAcumulados))));
  totalPremio   = computed(() =>
    this.boloesData().flatMap(b => b.cotas).flatMap(c => c.premios).reduce((s, p) => s + p.valorPorGanhador, 0),
  );
  melhorPosicao = computed(() => 0); // TODO: load from ranking

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const resumo = await this.portalApi.resumo();
      this.boloesData.set(
        resumo.boloes.map((bolao) => ({
          bolao,
          cotas: bolao.cotas,
          sorteios: bolao.sorteios,
        })),
      );
    } catch {
      this.error.set(this.translate.instant('portalCotas.errorLoad'));
      this.boloesData.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  fmtBrl(n: number): string {
    if (n >= 1000) return `R$ ${(n/1000).toFixed(0)}k`;
    return `R$ ${n.toFixed(2)}`;
  }
}
