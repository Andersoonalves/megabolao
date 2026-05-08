import { Component, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { BolasGridComponent } from '../../../shared/components/bolas-grid/bolas-grid.component';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'nb-dashboard-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, CurrencyPipe, DatePipe, StatCardComponent, BolasGridComponent, BadgeComponent],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center justify-between gap-4 sticky top-14 lg:top-0 z-10">
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Bolão CG</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Dashboard</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Dashboard</span>
      <div class="flex gap-2">
        <a routerLink="/relatorios" class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-900 transition-colors min-h-9">
          📄 Relatório
        </a>
        <a routerLink="/bolao/0/sorteio" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
          ✦ <span class="hidden sm:inline">Registrar sorteio</span><span class="sm:hidden">Sorteio</span>
        </a>
      </div>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-6">
        <h1 class="font-display text-[26px] font-semibold tracking-tight mb-1">Bolão Mega 2994</h1>
        <p class="text-slate-500 text-[13.5px]">Iniciado em 14/abr/2026 · 5 categorias · 3 sorteios realizados</p>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <nb-stat-card label="Cotas pagas"      value="9.244"      delta="↑ +312 hoje"        icon="🎫" />
        <nb-stat-card label="Arrecadação bruta" value="R$ 184.880" icon="💰" accent="gold" />
        <nb-stat-card label="Maior pontuação"  value="9 acertos"  delta="cota #4164 · Maria" icon="🏆" accent="gold" />
        <nb-stat-card label="Próximo sorteio"  value="01/mai"     delta="Concurso 2995 · 20h" icon="📅" accent="blue" />
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        <!-- Distribuição de pontuação -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="font-display font-semibold text-[15px]">Distribuição de pontuação</h3>
            <span class="text-slate-400 text-xs">9.244 cotas pagas</span>
          </div>
          <div class="p-5">
            <div class="flex items-end gap-1.5 h-44">
              @for (d of distribuicao; track d.acc) {
                <div class="flex-1 flex flex-col items-center gap-1">
                  <div class="text-[10.5px] text-slate-400">{{ d.n }}</div>
                  <div class="w-full rounded-t min-h-1 transition-all"
                       [style.height]="(d.n / 2960 * 100) + '%'"
                       [style.background]="d.acc >= 9 ? '#f59e0b' : '#059669'"
                       [style.opacity]="d.n === 0 ? 0.2 : 1"></div>
                  <div class="text-[11px] font-semibold text-slate-400">{{ d.acc }}</div>
                </div>
              }
            </div>
            <div class="text-[11.5px] text-slate-400 text-center mt-1.5">acertos acumulados após 3 sorteios</div>
          </div>
        </div>

        <!-- Bolas sorteadas -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="font-display font-semibold text-[15px]">Bolas sorteadas</h3>
            <span class="text-slate-400 text-xs">3 sorteios</span>
          </div>
          <div class="p-5">
            <nb-bolas-grid [drawn]="bolasDrawn" size="sm" [cols]="10" />
            <div class="flex gap-4 mt-3.5 text-[11.5px]">
              <span class="flex items-center gap-1.5">
                <span class="w-3 h-3 rounded-full bg-green-700 inline-block"></span> sorteada
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-3 h-3 rounded-full border border-slate-200 inline-block"></span> não sorteada
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Ranking + Próximas ações -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- Top 8 ranking -->
        <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="font-display font-semibold text-[15px]">Top 8 do ranking</h3>
            <a routerLink="/bolao/0/cotas" class="text-xs text-green-700 font-semibold no-underline">Ver todos ›</a>
          </div>
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11.5px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Pos</th>
                <th class="text-left text-[11.5px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Cota</th>
                <th class="text-left text-[11.5px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Participante</th>
                <th class="text-left text-[11.5px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Acertos</th>
                <th class="text-left text-[11.5px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of ranking; track r.c) {
                <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                  <td class="px-3 py-3">
                    <span class="w-6 h-6 rounded-[6px] inline-flex items-center justify-center font-bold text-[11px]"
                          [class]="r.p === 1 ? 'bg-amber-400 text-white' : r.p <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'">
                      {{ r.p }}
                    </span>
                  </td>
                  <td class="px-3 py-3 font-mono text-[12.5px]">#{{ r.c }}</td>
                  <td class="px-3 py-3 font-semibold">{{ r.n }}</td>
                  <td class="px-3 py-3 font-mono font-bold">{{ r.a }}/10</td>
                  <td class="px-3 py-3">
                    <nb-badge [variant]="r.s.includes('PRÊMIO') ? 'warn' : 'default'" [dot]="true">{{ r.s }}</nb-badge>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Próximas ações -->
        <div class="bg-white border border-slate-200 rounded-lg">
          <div class="px-5 py-4 border-b border-slate-200">
            <h3 class="font-display font-semibold text-[15px]">Próximas ações</h3>
          </div>
          @for (x of acoes; track x.t) {
            <div class="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 last:border-0">
              <div class="w-8 h-8 rounded-[8px] bg-green-50 text-green-700 flex items-center justify-center text-sm flex-shrink-0">
                {{ x.icon }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-semibold">{{ x.t }}</div>
                <div class="text-[11.5px] text-slate-400">{{ x.d }}</div>
              </div>
              <a class="text-[11.5px] text-green-700 font-semibold cursor-pointer">{{ x.a }}</a>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardAdminComponent {
  bolasDrawn = [4, 7, 12, 18, 23, 28, 31, 36, 42, 47, 49, 53, 56, 58, 3, 11, 19, 27];

  distribuicao = [
    { acc: 0, n: 412 }, { acc: 1, n: 1840 }, { acc: 2, n: 2960 },
    { acc: 3, n: 2150 }, { acc: 4, n: 1180 }, { acc: 5, n: 480 },
    { acc: 6, n: 158 },  { acc: 7, n: 48 },   { acc: 8, n: 14 },
    { acc: 9, n: 2 },    { acc: 10, n: 0 },
  ];

  ranking = [
    { p: 1, c: 4164, n: 'Maria L. Souza',  a: 9, s: 'PRÊMIO A RECEBER' },
    { p: 2, c: 213,  n: 'João Pedro M.',   a: 8, s: 'PRÊMIO A RECEBER' },
    { p: 3, c: 1837, n: 'Carlos E. Lima',  a: 8, s: 'EM ANDAMENTO' },
    { p: 4, c: 6029, n: 'Ana C. Ribeiro',  a: 7, s: 'EM ANDAMENTO' },
    { p: 5, c: 558,  n: 'Roberto S.',      a: 7, s: 'EM ANDAMENTO' },
    { p: 6, c: 7211, n: 'Fernanda T.',     a: 6, s: 'EM ANDAMENTO' },
    { p: 7, c: 902,  n: 'Lucas Pereira',   a: 6, s: 'EM ANDAMENTO' },
    { p: 8, c: 3340, n: 'Patrícia A.',     a: 6, s: 'EM ANDAMENTO' },
  ];

  acoes = [
    { icon: '📅', t: 'Sorteio 2995',          d: 'Quarta · 01/mai · 20h',        a: 'Lembrete em 2h' },
    { icon: '💰', t: '12 cotas pendentes',    d: 'R$ 240 a confirmar',            a: 'Confirmar' },
    { icon: '🏆', t: '2 prêmios a pagar',     d: 'Maria L. · João Pedro',         a: 'Registrar' },
    { icon: '💬', t: 'Grupo Família CG',      d: 'Sem mensagem há 3 dias',        a: 'Enviar status' },
  ];
}
