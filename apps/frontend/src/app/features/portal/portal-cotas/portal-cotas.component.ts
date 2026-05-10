import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CotaResponse {
  id: string;
  bolaoId: string;
  nomeIdentificacao: string;
  numeroCelular: string | null;
  numeroSequencial: number;
  palpites: number[];
  statusPagamento: string;
  totalAcertosAcumulados: number;
  statusResultado: string;
}

interface SorteioResponse {
  id: string;
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  sequenciaNoBolao: number;
  processado: boolean;
}

interface BolaoResponse {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
}

interface BolaoData {
  bolao: BolaoResponse;
  cotas: CotaResponse[];
  sorteios: SorteioResponse[];
  allDrawn: number[];
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-portal-cotas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <!-- Header verde ─────────────────────────────────────────────────────── -->
    <div style="background: linear-gradient(180deg, #065f46, #1a4436)" class="text-white">
      <!-- Top bar -->
      <div class="flex items-center justify-between px-4 pt-12 pb-4">
        <div>
          <div class="text-[11.5px] text-white/70 mb-1">{{ 'portalCotas.hello' | translate }}</div>
          <h1 class="font-display text-[20px] font-semibold tracking-tight">{{ nomeParticipante() }}</h1>
        </div>
        <button (click)="signOut()" class="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded-lg" [title]="'portalCotas.signOutTitle' | translate">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      <!-- Stats strip -->
      <div class="flex gap-3 px-4 pb-5">
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
        @for (i of [1,2]; track i) {
          <div class="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div class="h-16 bg-slate-100 animate-pulse"></div>
            <div class="p-4 flex flex-wrap gap-1.5">
              @for (j of [1,2,3,4,5,6,7,8,9,10]; track j) {
                <div class="w-8 h-8 rounded-full bg-slate-100 animate-pulse"></div>
              }
            </div>
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
          <div class="flex flex-col gap-3">
            <!-- Nome do bolão -->
            <div class="flex items-center justify-between px-1">
              <span class="font-display font-semibold text-[15px]">{{ bd.bolao.nome }}</span>
              <span class="text-[11.5px] text-slate-400">
                @if (bd.cotas.length === 1) {
                  {{ 'portalCotas.quotaSingle' | translate }}
                } @else {
                  {{ 'portalCotas.quotaMany' | translate:{ n: bd.cotas.length } }}
                }
              </span>
            </div>

            @for (cota of bd.cotas; track cota.id) {
              <!-- Cota card -->
              <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100"
                   [class]="cota.statusResultado === 'PREMIADO' ? 'border-amber-200 shadow-amber-50' : ''">

                <!-- Header do ticket -->
                <div class="px-4 pt-4 pb-3 border-b"
                     [style]="cota.statusResultado === 'PREMIADO' ? 'background: linear-gradient(135deg, #fffbeb, #fff); border-color: #fde68a' : 'border-color: #f1f5f9'">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <div class="font-display font-semibold text-[14.5px]">{{ bd.bolao.nome }}</div>
                      <div class="text-slate-400 text-[11.5px] mt-0.5">{{ 'portalCotas.quotaNum' | translate:{ n: cota.numeroSequencial } }}</div>
                    </div>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-wide uppercase border flex-shrink-0 mt-0.5"
                          [class]="resultadoBadgeClass(cota.statusResultado)">
                      {{ ('portalCotas.badge.' + cota.statusResultado) | translate }}
                    </span>
                  </div>
                </div>

                <!-- Círculos recortados (ticket style) -->
                <div class="relative">
                  <div class="absolute -left-2 top-0 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-50 border-r border-slate-100"></div>
                  <div class="absolute -right-2 top-0 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-50 border-l border-slate-100"></div>
                </div>

                <!-- Palpites -->
                <div class="px-4 pt-4 pb-3">
                  <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">{{ 'portalCotas.yourPicks' | translate }}</div>
                  <div class="flex flex-wrap gap-1.5">
                    @for (n of cota.palpites; track n) {
                      <span class="w-8 h-8 rounded-full flex items-center justify-center font-mono font-semibold text-[11.5px] border transition-all"
                            [class]="bolaClass(n, bd.allDrawn)">
                        {{ pad(n) }}
                      </span>
                    }
                  </div>

                  @if (bd.allDrawn.length > 0) {
                    <div class="flex gap-3 mt-2.5 text-[11px] text-slate-400">
                      <span class="flex items-center gap-1">
                        <span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span> {{ 'portalCotas.legendHit' | translate }}
                      </span>
                      <span class="flex items-center gap-1">
                        <span class="w-2.5 h-2.5 rounded-full bg-green-700 inline-block"></span> {{ 'portalCotas.legendDrawn' | translate }}
                      </span>
                    </div>
                  }
                </div>

                <!-- Stats da cota -->
                <div class="border-t border-slate-100">
                  <div class="flex">
                    <div class="flex-1 px-4 py-3 border-r border-slate-100">
                      <div class="text-[10.5px] text-slate-400">{{ 'portalCotas.accHits' | translate }}</div>
                      <div class="font-mono font-bold text-[15px] mt-0.5">{{ cota.totalAcertosAcumulados }}<span class="text-slate-300 font-normal">/10</span></div>
                    </div>
                    <div class="flex-1 px-4 py-3 border-r border-slate-100">
                      <div class="text-[10.5px] text-slate-400">{{ 'portalCotas.payment' | translate }}</div>
                      <div class="text-[12px] font-semibold mt-0.5"
                           [class]="cota.statusPagamento === 'PAGO' ? 'text-green-700' : 'text-amber-600'">
                        {{ ('portalCotas.payStatus.' + cota.statusPagamento) | translate }}
                      </div>
                    </div>
                    <div class="flex-1 px-4 py-3">
                      <div class="text-[10.5px] text-slate-400">{{ 'portalCotas.draws' | translate }}</div>
                      <div class="text-[12px] font-semibold mt-0.5">{{ bd.sorteios.length }}</div>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Sorteios realizados -->
            @if (bd.sorteios.length > 0) {
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div class="font-display font-semibold text-[14px] mb-3">{{ 'portalCotas.drawsDone' | translate }}</div>
                <div class="flex flex-col gap-3">
                  @for (s of bd.sorteios; track s.id) {
                    <div class="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                      <div class="flex-shrink-0 text-center min-w-[52px]">
                        <div class="font-mono font-bold text-[13px]">#{{ s.numeroConcurso }}</div>
                        <div class="text-[10px] text-slate-400">{{ fmtDate(s.dataSorteio) }}</div>
                      </div>
                      <div class="flex flex-wrap gap-1.5">
                        @for (n of s.bolasSorteadas; track n) {
                          <span class="w-7 h-7 rounded-full flex items-center justify-center font-mono font-semibold text-[10.5px] bg-green-700 text-white">
                            {{ pad(n) }}
                          </span>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class PortalCotasComponent implements OnInit {
  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  boloesData = signal<BolaoData[]>([]);
  loading    = signal(false);
  error      = signal('');

  // Computed
  totalCotas    = computed(() => this.boloesData().reduce((s, b) => s + b.cotas.length, 0));
  melhorAcertos = computed(() => Math.max(0, ...this.boloesData().flatMap(b => b.cotas.map(c => c.totalAcertosAcumulados))));
  totalPremio   = computed(() => 0); // TODO: load from premios endpoint
  melhorPosicao = computed(() => 0); // TODO: load from ranking

  nomeParticipante = computed(() => {
    const cotas = this.boloesData().flatMap(b => b.cotas);
    return cotas[0]?.nomeIdentificacao.split(' ')[0] ?? this.auth.user()?.celular ?? this.translate.instant('portalCotas.participantFallback');
  });

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      // 1. Busca bolões em andamento/finalizados
      const boloesRes = await firstValueFrom(
        this.api.get<{ data: BolaoResponse[] }>('/boloes?perPage=20'),
      );
      const boloes = boloesRes.data.filter(b => b.status !== 'A_SER_INICIADO');

      if (boloes.length === 0) {
        this.boloesData.set([]);
        return;
      }

      const phone = this.auth.user()?.celular ?? '';
      const result: BolaoData[] = [];

      for (const bolao of boloes) {
        const [cotasRes, sorteios] = await Promise.all([
          firstValueFrom(this.api.get<{ data: CotaResponse[] }>(
            `/boloes/${bolao.id}/cotas?perPage=50${phone ? `&busca=${phone}` : ''}`,
          )),
          firstValueFrom(this.api.get<SorteioResponse[]>(`/boloes/${bolao.id}/sorteios`)).catch(() => []),
        ]);

        if (cotasRes.data.length > 0) {
          const allDrawn = (sorteios as SorteioResponse[]).flatMap(s => s.bolasSorteadas);
          result.push({ bolao, cotas: cotasRes.data, sorteios: sorteios as SorteioResponse[], allDrawn });
        }
      }

      this.boloesData.set(result);
    } catch {
      this.error.set(this.translate.instant('portalCotas.errorLoad'));
      // Fallback demo
      this.boloesData.set(DEMO_DATA);
    } finally {
      this.loading.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  pad(n: number): string { return String(n).padStart(2, '0'); }

  bolaClass(n: number, allDrawn: number[]): string {
    if (allDrawn.length === 0) return 'bg-white text-slate-700 border-slate-200';
    const isDrawn = allDrawn.includes(n);
    // hit = in palpite AND drawn
    return isDrawn
      ? 'bg-amber-400 text-white border-amber-400 shadow-sm'  // acertou
      : 'bg-white text-slate-300 border-slate-100';
  }

  resultadoBadgeClass(status: string): string {
    if (status === 'PREMIADO')    return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'NAO_PREMIADO') return 'bg-slate-100 text-slate-500 border-slate-200';
    return 'bg-blue-50 text-blue-600 border-blue-200';
  }

  fmtBrl(n: number): string {
    if (n >= 1000) return `R$ ${(n/1000).toFixed(0)}k`;
    return `R$ ${n.toFixed(2)}`;
  }

  fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); }
    catch { return iso; }
  }
}

// ── Demo fallback ─────────────────────────────────────────────────────────────

const DEMO_DATA: BolaoData[] = [{
  bolao: { id: 'demo', nome: 'Bolão Mega 2994', status: 'EM_ANDAMENTO', valorCota: 30 },
  sorteios: [
    { id: 's1', numeroConcurso: 2994, dataSorteio: '2026-04-09', bolasSorteadas: [1,10,23,31,40,55], sequenciaNoBolao: 1, processado: true },
    { id: 's2', numeroConcurso: 2995, dataSorteio: '2026-04-11', bolasSorteadas: [8,29,42,49,50,58], sequenciaNoBolao: 2, processado: true },
  ],
  allDrawn: [1,10,23,31,40,55,8,29,42,49,50,58],
  cotas: [{
    id: 'c1', bolaoId: 'demo',
    nomeIdentificacao: 'MARIA L. SOUZA',
    numeroCelular: '83988884471',
    numeroSequencial: 4164,
    palpites: [1,7,8,14,15,23,26,32,42,55],
    statusPagamento: 'PAGO',
    totalAcertosAcumulados: 4,
    statusResultado: 'EM_ANDAMENTO',
  }],
}];
