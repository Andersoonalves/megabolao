import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PortalApiService, PortalBolao, PortalCota, PortalSorteio } from '../portal-api.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BolaoData {
  bolao: PortalBolao;
  cotas: PortalCota[];
  sorteios: PortalSorteio[];
  melhorAcertos: number;
  totalPremio: number;
  melhorCotaPos: number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-portal-cotas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, CurrencyPipe],
  template: `
    <!-- ── HEADER verde ──────────────────────────────────────────────────── -->
    <div class="flex-shrink-0 text-white" style="background: linear-gradient(160deg, #065f46, #064e3b); padding: 12px 16px 18px">
      <div class="flex justify-between items-center mb-3.5">
        <div class="text-[11px] opacity-70 font-semibold tracking-widest uppercase">
          {{ tenantLabel() }}
        </div>
        <div class="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold"
             style="background: rgba(255,255,255,0.15)">
          {{ iniciais() }}
        </div>
      </div>
      <div class="text-[11.5px] opacity-70 mb-0.5">Olá, {{ nomeDisplay() }}</div>
      <div class="font-display text-[22px] font-semibold" style="letter-spacing: -0.015em">
        {{ 'portalCotas.title' | translate }}
      </div>
    </div>

    <!-- ── CARD PRÊMIO (aparece se há prêmio a receber) ─────────────────── -->
    @if (totalPremioGeral() > 0) {
      <div class="px-3.5 pb-0 flex-shrink-0" style="background: #f8fafc; margin-top: -1px">
        <a [routerLink]="['/portal/premios']"
           class="no-underline flex items-center gap-3 rounded-2xl p-3.5 -mt-6 relative z-10"
           style="background: linear-gradient(135deg, #fef9c3, #fff);
                  border: 1px solid #fde68a;
                  box-shadow: 0 6px 18px rgba(0,0,0,0.06)">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-lg"
               style="background: #d97706">
            🏆
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[10.5px] font-bold tracking-widest uppercase" style="color: #92400e">
              {{ 'portalCotas.prizeLabel' | translate }}
            </div>
            <div class="font-display font-bold text-[18px] tabular text-slate-900">
              {{ totalPremioGeral() | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}
            </div>
            <div class="text-[11px] text-slate-400">{{ premioHint() }}</div>
          </div>
          <span class="text-slate-400 text-lg">›</span>
        </a>
      </div>
    }

    <!-- ── LISTA DE BOLÕES ────────────────────────────────────────────────── -->
    <div class="flex-1 overflow-auto px-3.5 flex flex-col gap-2.5"
         [class.pt-5]="totalPremioGeral() > 0"
         [class.pt-4]="totalPremioGeral() === 0"
         style="padding-bottom: 14px; background: #f8fafc">

      @if (loading()) {
        @for (i of [1, 2]; track i) {
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 animate-pulse">
            <div class="h-4 w-2/3 bg-slate-100 rounded mb-3"></div>
            <div class="h-3 w-1/2 bg-slate-100 rounded mb-4"></div>
            <div class="h-7 w-full bg-slate-100 rounded"></div>
          </div>
        }

      } @else if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          ⚠ {{ error() }}
        </div>

      } @else if (boloesData().length === 0) {
        <div class="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-100">
          <div class="text-3xl mb-3">🎫</div>
          <p class="text-slate-500 text-sm">{{ 'portalCotas.emptyError' | translate }}</p>
          <p class="text-slate-400 text-xs mt-1">{{ 'portalCotas.emptyHint' | translate }}</p>
        </div>

      } @else {
        <!-- Contador -->
        <div class="text-[12px] font-bold tracking-[0.04em] text-slate-400 mb-0.5">
          {{ 'portalCotas.poolCount' | translate:{ n: boloesData().length } }}
        </div>

        @for (bd of boloesData(); track bd.bolao.id) {
          @let ativo = bd.bolao.status === 'EM_ANDAMENTO';
          @let ultimoSorteio = bd.sorteios[0];

          <a [routerLink]="['/portal/boloes', bd.bolao.id]"
             class="block bg-white rounded-2xl no-underline text-inherit transition-all hover:shadow-md"
             style="border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02)">

            <!-- Cabeçalho do card -->
            <div class="flex items-start justify-between gap-3 p-3.5 pb-2.5">
              <div class="min-w-0 flex-1">
                <div class="font-display font-semibold text-[15px] text-slate-900 leading-snug">
                  {{ bd.bolao.nome }}
                </div>
                <div class="text-[11.5px] text-slate-400 mt-1">
                  {{ bd.cotas.length === 1 ? ('portalCotas.quotaSingle' | translate) : ('portalCotas.quotaMany' | translate:{ n: bd.cotas.length }) }}
                  · {{ bd.sorteios.length }}/{{ totalSorteiosBolao(bd.bolao) }} {{ 'portalCotas.draws' | translate }}
                </div>
              </div>
              @if (ativo) {
                <span class="text-[9.5px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                      style="background: #dcfce7; color: #166534; letter-spacing: 0.05em">
                  EM ANDAMENTO
                </span>
              } @else {
                <span class="text-[9.5px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500 flex-shrink-0"
                      style="letter-spacing: 0.05em">
                  FINALIZADO
                </span>
              }
            </div>

            <!-- Último sorteio ou aviso de aguardando -->
            @if (ultimoSorteio) {
              <div class="flex gap-1.5 px-3.5 pb-3">
                @for (n of ultimoSorteio.bolasSorteadas; track n) {
                  <span class="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                        style="background: #065f46">
                    {{ n < 10 ? '0' + n : n }}
                  </span>
                }
              </div>
            } @else if (ativo) {
              <div class="mx-3.5 mb-3 flex items-center gap-2 rounded-lg px-3 py-2.5"
                   style="background: #eff6ff">
                <span class="text-sm">📅</span>
                <span class="text-[12px] font-medium" style="color: #1d4ed8">
                  {{ 'portalCotas.awaitingDraw' | translate }}
                </span>
              </div>
            } @else {
              <div class="pb-2"></div>
            }

            <!-- Footer do card -->
            <div class="flex gap-3.5 px-3.5 py-3 border-t"
                 style="border-color: #f1f5f9; border-style: dashed">
              <!-- Melhor cota -->
              <div class="flex-1">
                <div class="text-[10.5px] font-semibold tracking-widest uppercase text-slate-400">
                  {{ 'portalCotas.bestQuota' | translate }}
                </div>
                <div class="font-bold text-[13px] text-slate-800 mt-0.5">
                  @if (bd.melhorAcertos > 0) {
                    {{ bd.melhorAcertos }} {{ 'portalCotas.hits' | translate }}
                    @if (bd.melhorCotaPos) {
                      <span class="text-[11px] font-normal text-slate-400"> · {{ bd.melhorCotaPos }}º</span>
                    }
                  } @else {
                    <span class="text-slate-300">—</span>
                  }
                </div>
              </div>

              <!-- Prêmio / Recebido -->
              <div class="flex-1 text-right">
                <div class="text-[10.5px] font-semibold tracking-widest uppercase text-slate-400">
                  {{ ativo ? ('portalCotas.toReceive' | translate) : ('portalCotas.received' | translate) }}
                </div>
                <div class="font-display font-bold text-[13.5px] tabular mt-0.5"
                     [style.color]="bd.totalPremio > 0 ? '#92400e' : '#94a3b8'">
                  @if (bd.totalPremio > 0) {
                    {{ bd.totalPremio | currency:'BRL':'symbol':'1.2-2':'pt-BR' }}
                  } @else {
                    <span class="text-slate-300">—</span>
                  }
                </div>
              </div>

              <!-- Botão Ver -->
              <button class="flex items-center gap-1 rounded-xl px-3 text-[12px] font-semibold text-white flex-shrink-0"
                      style="background: #1F4E79; border: 0">
                Ver ›
              </button>
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

  boloesData  = signal<BolaoData[]>([]);
  loading     = signal(false);
  error       = signal('');
  nomeDisplay = signal('');
  tenantLabel = signal('');

  // ── Computed ───────────────────────────────────────────────────────────────
  totalPremioGeral = computed(() =>
    this.boloesData().reduce((s, b) => s + b.totalPremio, 0),
  );

  premioHint = computed(() => {
    const bd = this.boloesData().find(b => b.totalPremio > 0);
    if (!bd) return '';
    const cota = bd.cotas.find(c => c.premios.length > 0);
    return cota ? `${bd.bolao.nome} · cota #${cota.numeroSequencial}` : bd.bolao.nome;
  });

  iniciais = computed(() => {
    const n = this.nomeDisplay();
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void { this.loadData(); }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const resumo = await this.portalApi.resumo();
      this.nomeDisplay.set(resumo.participante.nome || resumo.participante.celular);
      this.boloesData.set(
        resumo.boloes.map(bolao => ({
          bolao,
          cotas: bolao.cotas,
          sorteios: [...bolao.sorteios].sort((a, b) => b.sequenciaNoBolao - a.sequenciaNoBolao),
          melhorAcertos: Math.max(0, ...bolao.cotas.map(c =>
            bolao.sorteios.filter(s => s.processado).reduce((sum, s) => {
              const set = new Set(s.bolasSorteadas);
              return sum + c.palpites.filter(n => set.has(n)).length;
            }, 0)
          )),
          totalPremio: bolao.cotas.flatMap(c => c.premios).reduce((s, p) => s + p.valorPorGanhador, 0),
          melhorCotaPos: null, // TODO: resolver via ranking endpoint
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
  totalSorteiosBolao(bolao: PortalBolao): number {
    // Estimativa: busca o campo sorteiosRegistrados se existir, senão usa o que tem
    return bolao.sorteios.length || 6;
  }
}
