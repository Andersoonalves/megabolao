import { Component, signal, input, OnInit, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { BolasGridComponent } from '../../../shared/components/bolas-grid/bolas-grid.component';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

interface DashboardData {
  bolao: { nome: string; status: string; valorCota: number; dataInicio: string | null; dataTermino: string | null; categorias: number };
  totalPago: number;
  totalPendente: number;
  valorBruto: number;
  sorteios: { numeroConcurso: number; dataSorteio: string; bolasSorteadas: number[]; sequenciaNoBolao: number }[];
  bolasJaSorteadas: number[];
  ranking: { posicao: number; numeroSequencial: number; nomeIdentificacao: string; totalAcertosAcumulados: number; statusResultado: string }[];
  distribuicaoAcertos: { acertos: number; quantidade: number }[];
}

@Component({
  selector: 'nb-bolao-detalhes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, DecimalPipe, CurrencyPipe, DatePipe, BolasGridComponent, BadgeComponent],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <a routerLink="/boloes" class="text-slate-400 hover:text-slate-600 transition-colors">Bolões</a>
        @if (data()?.bolao) {
          <span class="text-slate-300">›</span>
          <span class="font-semibold truncate max-w-[200px]">{{ data()!.bolao.nome }}</span>
        }
        <span class="text-slate-300">›</span>
        <span class="text-slate-400">Detalhes</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Detalhes</span>
      <div class="flex gap-2">
        <a [routerLink]="['/bolao', id(), 'cotas']"
           class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-900 transition-colors min-h-9">
          🎫 Cotas
        </a>
        <a routerLink="/sorteios"
           class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
          ✦ <span class="hidden sm:inline">Registrar sorteio</span><span class="sm:hidden">Sorteio</span>
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
              {{ statusLabel(d.bolao.status) }}
            </span>
          </div>
          <p class="text-slate-500 text-[13.5px]">
            @if (d.bolao.dataInicio) { Iniciado em {{ d.bolao.dataInicio | date:'dd/MMM/yyyy' }} · }
            {{ d.bolao.categorias }} categoria(s) · {{ d.sorteios.length }} sorteio(s)
          </p>
        </div>

        <!-- KPIs -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">🎫 Cotas pagas</div>
            <div class="font-display text-[28px] font-semibold tracking-tight tabular">{{ d.totalPago | number }}</div>
            @if (d.totalPendente > 0) { <div class="text-[11.5px] text-amber-600 mt-0.5">{{ d.totalPendente }} pendente(s)</div> }
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">💰 Arrecadação</div>
            <div class="font-display text-[22px] font-semibold tracking-tight text-green-700 tabular">{{ d.valorBruto | currency:'BRL':'symbol':'1.0-0' }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">{{ d.bolao.valorCota | currency:'BRL':'symbol':'1.2-2' }} / cota</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">🏆 Melhor pontuação</div>
            @if (d.ranking.length > 0) {
              <div class="font-display text-[28px] font-semibold tracking-tight tabular text-amber-600">{{ d.ranking[0].totalAcertosAcumulados }}/10</div>
              <div class="text-[11.5px] text-slate-400 mt-0.5 truncate">#{{ d.ranking[0].numeroSequencial }} · {{ firstName(d.ranking[0].nomeIdentificacao) }}</div>
            } @else {
              <div class="font-display text-[28px] font-semibold tracking-tight text-slate-300">—</div>
              <div class="text-[11.5px] text-slate-400 mt-0.5">Nenhum sorteio ainda</div>
            }
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest mb-1">📅 Sorteios</div>
            <div class="font-display text-[28px] font-semibold tracking-tight tabular">{{ d.sorteios.length }}</div>
            @if (d.sorteios.length > 0) { <div class="text-[11.5px] text-slate-400 mt-0.5">Último: concurso {{ d.sorteios[d.sorteios.length-1].numeroConcurso }}</div> }
          </div>
        </div>

        <!-- Distribuição + Bolas -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 class="font-display font-semibold text-[15px]">Distribuição de pontuação</h3>
              <span class="text-slate-400 text-xs">{{ d.totalPago | number }} cotas pagas</span>
            </div>
            <div class="p-5">
              @if (d.distribuicaoAcertos.length === 0) {
                <div class="h-44 flex items-center justify-center text-slate-400 text-sm">Nenhum dado ainda</div>
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
                <div class="text-[11.5px] text-slate-400 text-center mt-1.5">acertos acumulados</div>
              }
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 class="font-display font-semibold text-[15px]">Bolas sorteadas</h3>
              <span class="text-slate-400 text-xs">{{ d.bolasJaSorteadas.length }}/60</span>
            </div>
            <div class="p-5">
              @if (d.bolasJaSorteadas.length === 0) {
                <div class="h-36 flex items-center justify-center text-slate-400 text-sm">Nenhum sorteio registrado</div>
              } @else {
                <nb-bolas-grid [drawn]="d.bolasJaSorteadas" size="sm" [cols]="10" />
                <div class="flex gap-4 mt-3.5 text-[11.5px]">
                  <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-green-700 inline-block"></span> sorteada ({{ d.bolasJaSorteadas.length }})</span>
                  <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full border border-slate-200 inline-block"></span> não sorteada ({{ 60 - d.bolasJaSorteadas.length }})</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Ranking + Sorteios -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 class="font-display font-semibold text-[15px]">Top ranking</h3>
              <a [routerLink]="['/bolao', id(), 'cotas']" class="text-xs text-green-700 font-semibold no-underline">Ver cotas ›</a>
            </div>
            @if (d.ranking.length === 0) {
              <div class="p-8 text-center text-slate-400 text-sm">Nenhuma cota paga ainda</div>
            } @else {
              <table class="w-full text-[13.5px]">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Pos</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Cota</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Participante</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Acertos</th>
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
                          {{ r.statusResultado === 'PREMIADO' ? 'Premiado' : 'Em andamento' }}
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
              <h3 class="font-display font-semibold text-[15px]">Sorteios realizados</h3>
            </div>
            @if (d.sorteios.length === 0) {
              <div class="p-8 text-center text-slate-400 text-sm">Nenhum sorteio registrado ainda.</div>
            } @else {
              <div class="divide-y divide-slate-100 overflow-y-auto max-h-[420px]">
                @for (s of d.sorteios.slice().reverse(); track s.numeroConcurso) {
                  <div class="px-5 py-3.5">
                    <div class="flex items-center justify-between mb-2">
                      <div>
                        <span class="font-semibold text-[13px]">Concurso {{ s.numeroConcurso }}</span>
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
      </div>
    }
  `,
})
export class BolaoDetalhesComponent implements OnInit {
  readonly id  = input<string>('');
  private readonly api = inject(ApiService);

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
      this.error.set('Erro ao carregar detalhes do bolão.');
    } finally {
      this.loading.set(false);
    }
  }

  qtd(d: DashboardData, acc: number): number { return d.distribuicaoAcertos.find(x => x.acertos === acc)?.quantidade ?? 0; }
  barH(d: DashboardData, acc: number): number { const max = Math.max(...d.distribuicaoAcertos.map(x => x.quantidade), 1); return (this.qtd(d, acc) / max) * 100; }
  firstName(nome: string): string { return nome.split(' ').slice(0, 2).join(' '); }
  pad(n: number): string { return String(n).padStart(2, '0'); }
  statusLabel(s: string): string {
    return ({ EM_ANDAMENTO: 'Em andamento', A_SER_INICIADO: 'A iniciar', FINALIZADO: 'Finalizado' } as Record<string, string>)[s] ?? s;
  }
}
