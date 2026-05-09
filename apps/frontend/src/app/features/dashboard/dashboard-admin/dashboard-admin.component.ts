import { Component, signal, computed, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CurrencyPipe, DatePipe, SlicePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

interface BolaoItem {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  dataInicio: string | null;
  dataTermino: string | null;
}

@Component({
  selector: 'nb-dashboard-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, CurrencyPipe, DatePipe, SlicePipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <span class="font-display font-semibold text-[14px] sm:text-base">Dashboard</span>
      <div class="flex gap-2">
        <a routerLink="/bolao/novo"
           class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
          + <span class="hidden sm:inline">Novo bolão</span>
        </a>
      </div>
    </div>

    <div class="p-4 lg:p-7">

      <!-- Título -->
      <div class="mb-6">
        <h1 class="font-display text-[26px] font-semibold tracking-tight mb-1">Visão geral</h1>
        <p class="text-slate-500 text-[13.5px]">Todos os bolões do tenant</p>
      </div>

      @if (loading()) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          @for (i of [1,2,3,4]; track i) { <div class="bg-white border border-slate-200 rounded-lg p-5 h-24 animate-pulse"></div> }
        </div>
      }

      @if (error()) {
        <div class="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ error() }}</div>
      }

      @if (!loading()) {
        <!-- KPIs agregados -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">🎲 Bolões ativos</div>
            <div class="font-display text-[28px] font-semibold tracking-tight tabular text-green-700">{{ emAndamento() }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">{{ bolaoes().length }} total</div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">🎫 Total de cotas</div>
            <div class="font-display text-[28px] font-semibold tracking-tight tabular">{{ totalCotas() | number }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">pagas (todos os bolões)</div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">💰 Arrecadação total</div>
            <div class="font-display text-[22px] font-semibold tracking-tight text-green-700 tabular">{{ totalArrecadado() | currency:'BRL':'symbol':'1.0-0' }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">acumulado de todos</div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">👥 Participantes</div>
            <div class="font-display text-[28px] font-semibold tracking-tight tabular">{{ totalParticipantes() | number }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">banco do tenant</div>
          </div>
        </div>

        <!-- Lista de bolões -->
        <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 class="font-display font-semibold text-[15px]">Bolões</h2>
            <a routerLink="/boloes" class="text-xs text-green-700 font-semibold no-underline">Ver todos ›</a>
          </div>

          @if (bolaoes().length === 0) {
            <div class="p-12 text-center">
              <div class="text-4xl mb-3">🎲</div>
              <p class="text-slate-500 text-sm mb-4">Nenhum bolão cadastrado ainda.</p>
              <a routerLink="/bolao/novo" class="inline-flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors">
                + Criar primeiro bolão
              </a>
            </div>
          } @else {
            <div class="divide-y divide-slate-100">
              @for (b of bolaoes(); track b.id) {
                <div class="px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                  <!-- Status dot + nome -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <span class="w-2 h-2 rounded-full flex-shrink-0"
                            [class]="b.status === 'EM_ANDAMENTO' ? 'bg-green-500' : b.status === 'A_SER_INICIADO' ? 'bg-blue-400' : 'bg-slate-300'"></span>
                      <span class="font-semibold text-[14px] truncate">{{ b.nome }}</span>
                      <span class="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                            [class]="b.status === 'EM_ANDAMENTO' ? 'bg-green-100 text-green-800' : b.status === 'A_SER_INICIADO' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'">
                        {{ statusLabel(b.status) }}
                      </span>
                    </div>
                    @if (b.dataInicio) {
                      <p class="text-[11.5px] text-slate-400 ml-4">{{ b.dataInicio | slice:0:10 | date:'dd/MM/yyyy' }}</p>
                    }
                  </div>

                  <!-- Stats -->
                  <div class="hidden sm:flex items-center gap-6 text-right flex-shrink-0">
                    <div>
                      <div class="font-semibold text-[14px] tabular">{{ b.totalCotasAtivas | number }}</div>
                      <div class="text-[10.5px] text-slate-400">cotas</div>
                    </div>
                    <div>
                      <div class="font-semibold text-[13px] tabular text-green-700">{{ b.valorBrutoArrecadado | currency:'BRL':'symbol':'1.0-0' }}</div>
                      <div class="text-[10.5px] text-slate-400">arrecadado</div>
                    </div>
                  </div>

                  <!-- Ações -->
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <a [routerLink]="['/bolao', b.id, 'cotas']"
                       class="px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 no-underline">
                      🎫 Cotas
                    </a>
                    <a [routerLink]="['/bolao', b.id, 'detalhes']"
                       class="px-2.5 py-1.5 text-[12px] font-semibold text-green-700 hover:bg-green-50 rounded-lg transition-colors border border-green-200 no-underline">
                      Ver detalhes →
                    </a>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Atalhos rápidos -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <a routerLink="/participantes"
             class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-green-300 hover:bg-green-50 transition-colors no-underline text-slate-700 group">
            <span class="text-2xl">👥</span>
            <span class="text-[12px] font-semibold text-center group-hover:text-green-700">Participantes</span>
          </a>
          <a routerLink="/sorteios"
             class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-green-300 hover:bg-green-50 transition-colors no-underline text-slate-700 group">
            <span class="text-2xl">✦</span>
            <span class="text-[12px] font-semibold text-center group-hover:text-green-700">Registrar sorteio</span>
          </a>
          <a routerLink="/whatsapp"
             class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-green-300 hover:bg-green-50 transition-colors no-underline text-slate-700 group">
            <span class="text-2xl">💬</span>
            <span class="text-[12px] font-semibold text-center group-hover:text-green-700">WhatsApp</span>
          </a>
          <a routerLink="/relatorios"
             class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-green-300 hover:bg-green-50 transition-colors no-underline text-slate-700 group">
            <span class="text-2xl">📄</span>
            <span class="text-[12px] font-semibold text-center group-hover:text-green-700">Relatórios</span>
          </a>
        </div>
      }
    </div>
  `,
})
export class DashboardAdminComponent implements OnInit {
  private readonly api = inject(ApiService);

  loading             = signal(true);
  error               = signal('');
  bolaoes             = signal<BolaoItem[]>([]);
  totalParticipantes  = signal(0);

  emAndamento   = computed(() => this.bolaoes().filter(b => b.status === 'EM_ANDAMENTO').length);
  totalCotas    = computed(() => this.bolaoes().reduce((s, b) => s + b.totalCotasAtivas, 0));
  totalArrecadado = computed(() => this.bolaoes().reduce((s, b) => s + b.valorBrutoArrecadado, 0));

  async ngOnInit(): Promise<void> {
    try {
      const [bolaoRes, partRes] = await Promise.all([
        firstValueFrom(this.api.get<{ data: BolaoItem[] }>('/boloes?perPage=50')),
        firstValueFrom(this.api.get<{ total: number }>('/participantes?perPage=1')).catch(() => ({ total: 0 })),
      ]);
      this.bolaoes.set(bolaoRes.data);
      this.totalParticipantes.set(partRes.total);
    } catch {
      this.error.set('Erro ao carregar dados.');
    } finally {
      this.loading.set(false);
    }
  }

  statusLabel(s: string): string {
    return ({ EM_ANDAMENTO: 'Ativo', A_SER_INICIADO: 'A iniciar', FINALIZADO: 'Finalizado', SUSPENSO: 'Suspenso' } as Record<string, string>)[s] ?? s;
  }
}
