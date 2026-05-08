import { Component, signal, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

interface RankingItem {
  posicao: number;
  cotaId: string;
  nomeIdentificacao: string;
  numeroSequencial: number;
  totalAcertosAcumulados: number;
  statusPagamento: string;
}

interface Paginated<T> { data: T[]; total: number; page: number; perPage: number; totalPages: number; }

// Demo bolão — substituir por seletor quando multi-bolão disponível
const DEMO_BOLAO_ID = '00000000-0000-0000-0000-000000000002';

@Component({
  selector: 'nb-portal-ranking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <!-- Header -->
    <div class="bg-green-800 text-white px-4 pt-12 pb-5">
      <h1 class="font-display text-[22px] font-semibold tracking-tight mb-1">Ranking</h1>
      <p class="text-white/60 text-[13px]">{{ total() }} cotas participando</p>
    </div>

    <div class="px-4 py-4">
      @if (loading()) {
        @for (i of [1,2,3,4,5,6,7,8]; track i) {
          <div class="flex items-center gap-3 py-3 border-b border-slate-100">
            <div class="w-7 h-7 bg-slate-100 rounded-lg animate-pulse flex-shrink-0"></div>
            <div class="flex-1 h-4 bg-slate-100 rounded animate-pulse"></div>
            <div class="w-12 h-4 bg-slate-100 rounded animate-pulse"></div>
          </div>
        }
      } @else if (ranking().length === 0) {
        <div class="text-center py-12 text-slate-400 text-sm">
          Nenhum resultado disponível ainda.
        </div>
      } @else {
        <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          @for (r of ranking(); track r.cotaId) {
            <div class="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 last:border-0"
                 [class]="r.posicao <= 3 ? 'bg-amber-50/50' : ''">
              <!-- Posição -->
              <div class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[12px] flex-shrink-0"
                   [class]="r.posicao === 1 ? 'bg-amber-400 text-white' : r.posicao <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'">
                {{ r.posicao }}
              </div>

              <!-- Nome + cota -->
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-[13.5px] truncate">{{ r.nomeIdentificacao }}</div>
                <div class="text-[11px] text-slate-400 font-mono">cota #{{ r.numeroSequencial }}</div>
              </div>

              <!-- Acertos -->
              <div class="text-right flex-shrink-0">
                <div class="font-mono font-bold text-[15px] tabular">{{ r.totalAcertosAcumulados }}<span class="text-slate-300 text-[11px] font-normal">/10</span></div>
              </div>
            </div>
          }
        </div>

        @if (totalPages() > 1) {
          <div class="flex justify-center gap-2 mt-4">
            <button (click)="prevPage()" [disabled]="page() <= 1"
                    class="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-40">
              ← Anterior
            </button>
            <span class="px-3 py-2 text-sm text-slate-400">{{ page() }}/{{ totalPages() }}</span>
            <button (click)="nextPage()" [disabled]="page() >= totalPages()"
                    class="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-40">
              Próxima →
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class PortalRankingComponent implements OnInit {
  private readonly api = inject(ApiService);

  ranking    = signal<RankingItem[]>([]);
  loading    = signal(false);
  total      = signal(0);
  totalPages = signal(0);
  page       = signal(1);

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.api.get<Paginated<RankingItem>>(
          `/boloes/${DEMO_BOLAO_ID}/premios/ranking?page=${this.page()}&perPage=30`,
        ),
      );
      this.ranking.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.totalPages);
    } catch {
      // Fallback demo
      this.ranking.set(DEMO_RANKING);
      this.total.set(DEMO_RANKING.length);
      this.totalPages.set(1);
    } finally {
      this.loading.set(false);
    }
  }

  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); } }
}

const DEMO_RANKING: RankingItem[] = [
  { posicao: 1, cotaId: 'c1', nomeIdentificacao: 'MARIA L. SOUZA',    numeroSequencial: 4164, totalAcertosAcumulados: 9, statusPagamento: 'PAGO' },
  { posicao: 2, cotaId: 'c2', nomeIdentificacao: 'JOÃO PEDRO M.',     numeroSequencial: 213,  totalAcertosAcumulados: 8, statusPagamento: 'PAGO' },
  { posicao: 3, cotaId: 'c3', nomeIdentificacao: 'CARLOS E. LIMA',    numeroSequencial: 1837, totalAcertosAcumulados: 8, statusPagamento: 'PAGO' },
  { posicao: 4, cotaId: 'c4', nomeIdentificacao: 'ANA C. RIBEIRO',    numeroSequencial: 6029, totalAcertosAcumulados: 7, statusPagamento: 'PAGO' },
  { posicao: 5, cotaId: 'c5', nomeIdentificacao: 'ROBERTO S.',        numeroSequencial: 558,  totalAcertosAcumulados: 7, statusPagamento: 'PAGO' },
  { posicao: 6, cotaId: 'c6', nomeIdentificacao: 'FERNANDA T.',       numeroSequencial: 7211, totalAcertosAcumulados: 6, statusPagamento: 'PAGO' },
  { posicao: 7, cotaId: 'c7', nomeIdentificacao: 'LUCAS PEREIRA',     numeroSequencial: 902,  totalAcertosAcumulados: 6, statusPagamento: 'PAGO' } as RankingItem,
  { posicao: 8, cotaId: 'c8', nomeIdentificacao: 'PATRÍCIA A.',       numeroSequencial: 3340, totalAcertosAcumulados: 6, statusPagamento: 'PAGO' },
];
