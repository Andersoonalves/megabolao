import { Component, signal, input, OnInit, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { BolasGridComponent } from '../../../shared/components/bolas-grid/bolas-grid.component';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

type CategoriaTipo =
  | 'TAXA_ADMINISTRATIVA'
  | 'ACERTOS_EXATOS'
  | 'MAIOR_PONTUACAO_SORTEIO'
  | 'MAIOR_PONTUACAO_GERAL'
  | 'MENOR_PONTUACAO_GERAL';

interface CategoriaItem {
  id: string;
  ordem: number;
  nome: string;
  tipo: CategoriaTipo;
  acertosAlvo: number | null;
  sorteioReferencia: number | null;
  percentual: number;
  acumulaSemGanhador: boolean;
  valorAcumuladoAnterior: number;
}

interface DashboardData {
  bolao: { nome: string; status: string; valorCota: number; dataInicio: string | null; dataTermino: string | null; categorias: number };
  totalPago: number;
  totalPendente: number;
  valorBruto: number;
  categorias: CategoriaItem[];
  sorteios: { numeroConcurso: number; dataSorteio: string; bolasSorteadas: number[]; sequenciaNoBolao: number }[];
  bolasJaSorteadas: number[];
  ranking: { posicao: number; numeroSequencial: number; nomeIdentificacao: string; totalAcertosAcumulados: number; statusResultado: string }[];
  distribuicaoAcertos: { acertos: number; quantidade: number }[];
}

const TIPO_CHIP: Record<CategoriaTipo, string> = {
  TAXA_ADMINISTRATIVA:     'bg-slate-100 text-slate-700',
  ACERTOS_EXATOS:          'bg-green-50 text-green-800',
  MAIOR_PONTUACAO_SORTEIO: 'bg-blue-50 text-blue-700',
  MAIOR_PONTUACAO_GERAL:   'bg-amber-50 text-amber-600',
  MENOR_PONTUACAO_GERAL:   'bg-red-50 text-red-700',
};

@Component({
  selector: 'nb-bolao-detalhes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, DecimalPipe, CurrencyPipe, DatePipe, BolasGridComponent, BadgeComponent, TranslatePipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <a routerLink="/boloes" class="text-slate-400 hover:text-slate-600 transition-colors">{{ 'bolaoDetalhes.breadcrumbPools' | translate }}</a>
        @if (data()?.bolao) {
          <span class="text-slate-300">›</span>
          <span class="font-semibold truncate max-w-[200px]">{{ data()!.bolao.nome }}</span>
        }
        <span class="text-slate-300">›</span>
        <span class="text-slate-400">{{ 'bolaoDetalhes.breadcrumbDetails' | translate }}</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">{{ 'bolaoDetalhes.breadcrumbDetails' | translate }}</span>
      <div class="flex gap-2">
        <a [routerLink]="['/bolao', id(), 'cotas']"
           class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-900 transition-colors min-h-9">
          {{ 'common.viewQuotas' | translate }}
        </a>
        <a routerLink="/sorteios"
           class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
          ✦ <span class="hidden sm:inline">{{ 'bolaoDetalhes.registerDraw' | translate }}</span><span class="sm:hidden">{{ 'bolaoDetalhes.registerDrawShort' | translate }}</span>
        </a>
      </div>
    </div>

    @if (loading()) {
      <div class="p-4 lg:p-7">
        <div class="h-8 bg-slate-100 rounded-lg w-1/3 mb-2 animate-pulse"></div>
        <div class="h-4 bg-slate-100 rounded w-1/2 mb-6 animate-pulse"></div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          @for (i of [1,2,3,4]; track i) { <div class="bg-white border border-slate-200 rounded-lg p-5 h-24 animate-pulse"></div> }
        </div>
      </div>
    }
    @if (error()) {
      <div class="p-7"><div class="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ error() }}</div></div>
    }

    @if (data(); as d) {
      <div class="p-4 lg:p-7">
        <!-- Título -->
        <div class="mb-6">
          <div class="flex items-center gap-2 mb-1">
            <h1 class="font-display text-[26px] font-semibold tracking-tight">{{ d.bolao.nome }}</h1>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase"
                  [class]="d.bolao.status === 'EM_ANDAMENTO' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'">
              {{ ('dashboardAdmin.status.' + d.bolao.status) | translate }}
            </span>
          </div>
          <p class="text-slate-500 text-[13.5px]">
            @if (d.bolao.dataInicio) {
              {{ 'bolaoDetalhes.metaStarted' | translate }} {{ d.bolao.dataInicio | date:'dd/MMM/yyyy' }}{{ 'bolaoDetalhes.metaSep' | translate }}
            }
            {{ 'bolaoDetalhes.metaCategories' | translate:{ cats: d.bolao.categorias, draws: d.sorteios.length } }}
          </p>
        </div>

        <!-- KPIs -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{{ 'bolaoDetalhes.kpiPaidQuotas' | translate }}</div>
            <div class="font-display text-[28px] font-semibold tracking-tight tabular">{{ d.totalPago | number }}</div>
            @if (d.totalPendente > 0) { <div class="text-[11.5px] text-amber-600 mt-0.5">{{ 'bolaoDetalhes.pendingSuffix' | translate:{ n: d.totalPendente } }}</div> }
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{{ 'bolaoDetalhes.kpiRevenue' | translate }}</div>
            <div class="font-display text-[22px] font-semibold tracking-tight text-green-700 tabular">{{ d.valorBruto | currency:'BRL':'symbol':'1.0-0' }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">{{ d.bolao.valorCota | currency:'BRL':'symbol':'1.2-2' }}{{ 'bolaoDetalhes.perQuota' | translate }}</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{{ 'bolaoDetalhes.kpiBest' | translate }}</div>
            @if (d.ranking.length > 0) {
              <div class="font-display text-[28px] font-semibold tracking-tight tabular text-amber-600">{{ d.ranking[0].totalAcertosAcumulados }}/10</div>
              <div class="text-[11.5px] text-slate-400 mt-0.5 truncate">#{{ d.ranking[0].numeroSequencial }} · {{ firstName(d.ranking[0].nomeIdentificacao) }}</div>
            } @else {
              <div class="font-display text-[28px] font-semibold tracking-tight text-slate-300">—</div>
              <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'bolaoDetalhes.noDrawYet' | translate }}</div>
            }
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{{ 'bolaoDetalhes.sorteios' | translate }}</div>
            <div class="font-display text-[28px] font-semibold tracking-tight tabular">{{ d.sorteios.length }}</div>
            @if (d.sorteios.length > 0) { <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'bolaoDetalhes.lastDraw' | translate:{ n: d.sorteios[d.sorteios.length-1].numeroConcurso } }}</div> }
          </div>
        </div>

        <!-- Distribuição + Bolas -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 class="font-display font-semibold text-[15px]">{{ 'bolaoDetalhes.chartTitle' | translate }}</h3>
              <span class="text-slate-400 text-xs">{{ 'bolaoDetalhes.chartCaptionPaid' | translate:{ n: d.totalPago } }}</span>
            </div>
            <div class="p-5">
              @if (d.distribuicaoAcertos.length === 0) {
                <div class="h-44 flex items-center justify-center text-slate-400 text-sm">{{ 'bolaoDetalhes.chartEmpty' | translate }}</div>
              } @else {
                <div class="flex items-end gap-1 h-44">
                  @for (acc of acertosRange; track acc) {
                    <div class="flex-1 flex flex-col items-center gap-1">
                      <div class="text-[9.5px] text-slate-400">{{ qtd(d, acc) | number }}</div>
                      <div class="w-full rounded-t min-h-[2px]"
                           [style.height.%]="barH(d, acc)"
                           [style.background]="acc >= 9 ? '#f59e0b' : acc >= 6 ? '#059669' : '#94a3b8'"
                           [style.opacity]="qtd(d, acc) === 0 ? 0.2 : 1"></div>
                      <div class="text-[10px] font-semibold text-slate-400">{{ acc }}</div>
                    </div>
                  }
                </div>
                <div class="text-[11.5px] text-slate-400 text-center mt-1.5">{{ 'bolaoDetalhes.hitsAxis' | translate }}</div>
              }
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 class="font-display font-semibold text-[15px]">{{ 'bolaoDetalhes.ballsTitle' | translate }}</h3>
              <span class="text-slate-400 text-xs">{{ d.bolasJaSorteadas.length }}/60</span>
            </div>
            <div class="p-5">
              @if (d.bolasJaSorteadas.length === 0) {
                <div class="h-36 flex items-center justify-center text-slate-400 text-sm">{{ 'bolaoDetalhes.ballsEmpty' | translate }}</div>
              } @else {
                <nb-bolas-grid [drawn]="d.bolasJaSorteadas" size="sm" [cols]="10" />
                <div class="flex gap-4 mt-3.5 text-[11.5px]">
                  <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-green-700 inline-block"></span> {{ 'bolaoDetalhes.legendDrawnCount' | translate:{ n: d.bolasJaSorteadas.length } }}</span>
                  <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full border border-slate-200 inline-block"></span> {{ 'bolaoDetalhes.legendNotDrawn' | translate:{ n: 60 - d.bolasJaSorteadas.length } }}</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Ranking + Sorteios -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 class="font-display font-semibold text-[15px]">{{ 'bolaoDetalhes.topTitle' | translate }}</h3>
              <a [routerLink]="['/bolao', id(), 'cotas']" class="text-xs text-green-700 font-semibold no-underline">{{ 'common.viewQuotas' | translate }} ›</a>
            </div>
            @if (d.ranking.length === 0) {
              <div class="p-8 text-center text-slate-400 text-sm">{{ 'bolaoDetalhes.topEmpty' | translate }}</div>
            } @else {
              <table class="w-full text-[13.5px]">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thPos' | translate }}</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thQuota' | translate }}</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thParticipant' | translate }}</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thHits' | translate }}</th>
                    <th class="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of d.ranking; track r.numeroSequencial) {
                    <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                      <td class="px-3 py-3">
                        <span class="w-6 h-6 rounded-[6px] inline-flex items-center justify-center font-bold text-[11px]"
                              [class]="r.posicao === 1 ? 'bg-amber-400 text-white' : r.posicao <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'">
                          {{ r.posicao }}
                        </span>
                      </td>
                      <td class="px-3 py-3 font-mono text-[12.5px]">#{{ r.numeroSequencial }}</td>
                      <td class="px-3 py-3 font-semibold truncate max-w-[120px]">{{ firstName(r.nomeIdentificacao) }}</td>
                      <td class="px-3 py-3 font-mono font-bold"
                          [class]="r.totalAcertosAcumulados >= 8 ? 'text-amber-600' : r.totalAcertosAcumulados >= 5 ? 'text-green-700' : ''">
                        {{ r.totalAcertosAcumulados }}/10
                      </td>
                      <td class="px-3 py-3">
                        <nb-badge [variant]="r.statusResultado === 'PREMIADO' ? 'warn' : 'default'" [dot]="true">
                          {{ (r.statusResultado === 'PREMIADO' ? 'bolaoDetalhes.rankingBadgePremiado' : 'bolaoDetalhes.rankingBadgeAndamento') | translate }}
                        </nb-badge>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>

          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">{{ 'bolaoDetalhes.drawsTitle' | translate }}</h3>
            </div>
            @if (d.sorteios.length === 0) {
              <div class="p-8 text-center text-slate-400 text-sm">{{ 'bolaoDetalhes.drawsEmpty' | translate }}</div>
            } @else {
              <div class="divide-y divide-slate-100 overflow-y-auto max-h-[420px]">
                @for (s of d.sorteios.slice().reverse(); track s.numeroConcurso) {
                  <div class="px-5 py-3.5">
                    <div class="flex items-center justify-between mb-2">
                      <div>
                        <span class="font-semibold text-[13px]">{{ 'bolaoDetalhes.concurso' | translate:{ n: s.numeroConcurso } }}</span>
                        <span class="text-slate-400 text-[12px] ml-2">· {{ s.dataSorteio | date:'dd/MM/yyyy' }}</span>
                      </div>
                      <span class="text-[11px] text-slate-400">{{ s.sequenciaNoBolao }}º</span>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      @for (b of s.bolasSorteadas; track b) {
                        <span class="w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-[10.5px] bg-green-700 text-white">{{ pad(b) }}</span>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
         <!-- Categorias de premiação -->
        <div class="bg-white border border-slate-200 rounded-lg mb-5">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h3 class="font-display font-semibold text-[15px]">{{ 'bolaoDetalhes.categoriesTitle' | translate }}</h3>
              <p class="text-[11.5px] text-slate-400 mt-0.5">
                {{ 'bolaoDetalhes.categoriasResumo' | translate:{ n: d.categorias.length, bruto: (d.valorBruto | currency:'BRL':'symbol':'1.0-0') } }}
              </p>
            </div>
          </div>

          @if (d.categorias.length === 0) {
            <div class="p-8 text-center text-slate-400 text-sm">{{ 'bolaoDetalhes.categoriesEmpty' | translate }}</div>
          } @else {
            <!-- Mobile: cards -->
            <div class="lg:hidden divide-y divide-slate-100">
              @for (c of d.categorias; track c.id) {
                <div class="px-5 py-4">
                  <div class="flex items-start justify-between gap-3 mb-1.5">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10.5px] font-mono text-slate-400">#{{ c.ordem }}</span>
                        <span class="px-2 py-0.5 rounded-full text-[10.5px] font-semibold" [class]="chipClass(c.tipo)">
                          {{ tipoLabel(c.tipo) }}
                        </span>
                        @if (c.acumulaSemGanhador) {
                          <span class="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-gold-50 text-gold-700">
                            {{ 'bolaoDetalhes.acumulaChip' | translate }}
                          </span>
                        }
                      </div>
                      <div class="font-semibold text-[14px] truncate">{{ c.nome }}</div>
                      @if (categoriaDetalhe(c); as det) {
                        <div class="text-[12px] text-slate-500 mt-0.5">{{ det }}</div>
                      }
                    </div>
                    <div class="text-right shrink-0">
                      <div class="font-display text-[18px] font-semibold tracking-tight tabular text-green-700">
                        {{ c.percentual | number:'1.0-2' }}%
                      </div>
                      <div class="text-[11px] text-slate-400 tabular">
                        {{ valorEstimado(c, d.valorBruto) | currency:'BRL':'symbol':'1.0-0' }}
                      </div>
                    </div>
                  </div>
                  @if (c.valorAcumuladoAnterior > 0) {
                    <div class="text-[11px] text-amber-600 mt-1">
                      {{ 'bolaoDetalhes.acumuladoBolaoAnterior' | translate:{ v: (c.valorAcumuladoAnterior | currency:'BRL':'symbol':'1.2-2') } }}
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Desktop: tabela -->
            <table class="hidden lg:table w-full text-[13.5px]">
              <thead class="bg-slate-50">
                <tr>
                  <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-2.5 w-12">#</th>
                  <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thCategory' | translate }}</th>
                  <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thType' | translate }}</th>
                  <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thDetail' | translate }}</th>
                  <th class="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">{{ 'bolaoDetalhes.thPercent' | translate }}</th>
                  <th class="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-2.5">{{ 'bolaoDetalhes.thEstimated' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (c of d.categorias; track c.id) {
                  <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td class="px-5 py-3 font-mono text-[12.5px] text-slate-400">{{ c.ordem }}</td>
                    <td class="px-3 py-3">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold">{{ c.nome }}</span>
                        @if (c.acumulaSemGanhador) {
                          <span class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gold-50 text-gold-700"
                                [title]="'bolaoDetalhes.acumulaTitle' | translate">↻</span>
                        }
                      </div>
                    </td>
                    <td class="px-3 py-3">
                      <span class="px-2 py-0.5 rounded-full text-[10.5px] font-semibold inline-block" [class]="chipClass(c.tipo)">
                        {{ tipoLabel(c.tipo) }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-slate-500 text-[12.5px]">
                      {{ categoriaDetalhe(c) || ('bolaoDetalhes.dash' | translate) }}
                    </td>
                    <td class="px-3 py-3 text-right font-display font-semibold tabular text-green-700">
                      {{ c.percentual | number:'1.0-2' }}%
                    </td>
                    <td class="px-5 py-3 text-right tabular">
                      <div class="font-semibold">{{ valorEstimado(c, d.valorBruto) | currency:'BRL':'symbol':'1.0-0' }}</div>
                      @if (c.valorAcumuladoAnterior > 0) {
                        <div class="text-[11px] text-amber-600">{{ 'bolaoDetalhes.acumShort' | translate:{ v: (c.valorAcumuladoAnterior | currency:'BRL':'symbol':'1.2-2') } }}</div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot class="bg-slate-50">
                <tr>
                  <td colspan="4" class="px-5 py-2.5 text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'bolaoDetalhes.totalRow' | translate }}</td>
                  <td class="px-3 py-2.5 text-right font-display font-semibold tabular text-slate-700">
                    {{ totalPercentual(d.categorias) | number:'1.0-2' }}%
                  </td>
                  <td class="px-5 py-2.5 text-right font-display font-semibold tabular text-slate-700">
                    {{ d.valorBruto | currency:'BRL':'symbol':'1.0-0' }}
                  </td>
                </tr>
              </tfoot>
            </table>
          }
        </div>
      </div>
    }
  `,
})
export class BolaoDetalhesComponent implements OnInit {
  readonly id  = input<string>('');
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  loading = signal(true);
  error   = signal('');
  data    = signal<DashboardData | null>(null);

  readonly acertosRange = [0,1,2,3,4,5,6,7,8,9,10];

  constructor() {
    effect(() => { if (this.id()) this.load(); });
  }

  ngOnInit(): void {}

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await firstValueFrom(this.api.get<DashboardData>(`/boloes/${this.id()}/dashboard`));
      this.data.set(d);
    } catch {
      this.error.set(this.translate.instant('errors.loadDetails'));
    } finally {
      this.loading.set(false);
    }
  }

  qtd(d: DashboardData, acc: number): number { return d.distribuicaoAcertos.find(x => x.acertos === acc)?.quantidade ?? 0; }
  barH(d: DashboardData, acc: number): number { const max = Math.max(...d.distribuicaoAcertos.map(x => x.quantidade), 1); return (this.qtd(d, acc) / max) * 100; }
  firstName(nome: string): string { return nome.split(' ').slice(0, 2).join(' '); }
  pad(n: number): string { return String(n).padStart(2, '0'); }
  tipoLabel(t: CategoriaTipo): string {
    return this.translate.instant(`bolaoDetalhes.tipo.${t}`);
  }
  chipClass(t: CategoriaTipo): string { return TIPO_CHIP[t]; }

  /**
   * Texto adicional por tipo: alvo de acertos, sorteio de referência, etc.
   * Retorna string vazia quando o tipo não tem detalhe específico.
   */
  categoriaDetalhe(c: CategoriaItem): string {
    const t = this.translate;
    switch (c.tipo) {
      case 'ACERTOS_EXATOS':
        return c.acertosAlvo != null ? t.instant('bolaoDetalhes.catDetalhe.acertos', { n: c.acertosAlvo }) : '';
      case 'MAIOR_PONTUACAO_SORTEIO':
        return c.sorteioReferencia != null ? t.instant('bolaoDetalhes.catDetalhe.sorteio', { n: c.sorteioReferencia }) : '';
      case 'MAIOR_PONTUACAO_GERAL':
        return t.instant('bolaoDetalhes.catDetalhe.maiorGeral');
      case 'MENOR_PONTUACAO_GERAL':
        return t.instant('bolaoDetalhes.catDetalhe.menorGeral');
      case 'TAXA_ADMINISTRATIVA':
        return t.instant('bolaoDetalhes.catDetalhe.taxa');
      default:
        return '';
    }
  }

  valorEstimado(c: CategoriaItem, valorBruto: number): number {
    return (c.percentual / 100) * valorBruto + (c.valorAcumuladoAnterior ?? 0);
  }

  totalPercentual(cats: CategoriaItem[]): number {
    return cats.reduce((acc, c) => acc + c.percentual, 0);
  }
}
