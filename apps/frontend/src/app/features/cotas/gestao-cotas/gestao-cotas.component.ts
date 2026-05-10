import {
  Component, signal, computed, input, OnInit, ChangeDetectionStrategy, inject, effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { PhoneMaskDirective, PhonePipe } from '../../../shared/phone';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { BrlPipe, LocalNumPipe } from '../../../shared/pipes/locale-pipes';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CotaResponse {
  id: string;
  bolaoId: string;
  nomeIdentificacao: string;
  numeroCelular: string | null;
  numeroSequencial: number;
  palpites: number[];
  statusPagamento: 'PENDENTE' | 'PAGO' | 'INATIVO';
  totalAcertosAcumulados: number;
  statusResultado: 'EM_ANDAMENTO' | 'PREMIADO' | 'NAO_PREMIADO';
  criadoEm: string;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-gestao-cotas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, RouterLink, LocalNumPipe, BrlPipe, PhoneMaskDirective, PhonePipe, TranslatePipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <a routerLink="/boloes" class="text-slate-400 hover:text-slate-600 transition-colors">{{ 'listaBoloes.breadcrumb' | translate }}</a>
        @if (bolao()) {
          <span class="text-slate-300">›</span>
          <span class="text-slate-500 truncate max-w-[180px]">{{ bolao()!.nome }}</span>
        }
        <span class="text-slate-300">›</span>
        <span class="font-semibold">{{ 'gestaoCotas.title' | translate }}</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">
        {{ bolao()?.nome ?? ('gestaoCotas.titleMobileFallback' | translate) }}
      </span>
      <button (click)="showModal.set(true)"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9">
        {{ 'gestaoCotas.registerBtn' | translate }}
      </button>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <div class="flex items-center gap-2 mb-1">
          <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight">{{ 'gestaoCotas.title' | translate }}</h1>
          @if (bolao()) {
            <span class="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[12px] font-semibold rounded-full truncate max-w-[240px]">
              {{ bolao()!.nome }}
            </span>
          }
        </div>
        <p class="text-slate-500 text-[13.5px]">
          {{ 'gestaoCotas.subtitleLine' | translate: { total: total(), paid: totalPago(), pend: totalPendente() } }}
        </p>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'gestaoCotas.kpiPaid' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular">{{ totalPago() | localNum }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'gestaoCotas.kpiPending' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular text-amber-600">{{ totalPendente() }}</div>
          @if (totalPendente() > 0) {
            <div class="text-xs text-slate-400 mt-0.5">{{ 'gestaoCotas.pendingValueHint' | translate: { v: valorPendente().toFixed(2) } }}</div>
          }
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'gestaoCotas.kpiTotalQuotas' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular">{{ total() | localNum }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'gestaoCotas.kpiGross' | translate }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular text-green-700">{{ valorBruto() | brl }}</div>
        </div>
      </div>

      <!-- Main card -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">

        <!-- Card header: search + filters -->
        <div class="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Search -->
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input [ngModel]="busca()" (ngModelChange)="onBuscaChange($event)"
                     class="pl-8 pr-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700 w-72"
                     [attr.placeholder]="'gestaoCotas.searchPh' | translate" />
            </div>
            <!-- Status filter -->
            <select [ngModel]="statusFiltro()" (ngModelChange)="onStatusChange($event)"
                    class="px-2.5 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] bg-white focus:outline-none focus:border-green-700">
              <option value="">{{ 'gestaoCotas.filterStatusAll' | translate }}</option>
              <option value="PAGO">{{ 'gestaoCotas.payStatusPAGO' | translate }}</option>
              <option value="PENDENTE">{{ 'gestaoCotas.payStatusPENDENTE' | translate }}</option>
              <option value="INATIVO">{{ 'gestaoCotas.payStatusINATIVO' | translate }}</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold rounded-[10px] text-slate-700 transition-colors">
              {{ 'gestaoCotas.import' | translate }}
            </button>
            <button class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-semibold rounded-[10px] text-slate-700 transition-colors">
              {{ 'gestaoCotas.export' | translate }}
            </button>
          </div>
        </div>

        <!-- Error -->
        @if (error()) {
          <div class="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">⚠ {{ error() }}</div>
        }

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'gestaoCotas.thCota' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'gestaoCotas.thParticipant' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'gestaoCotas.thPhone' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'gestaoCotas.thPicks' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'gestaoCotas.thHits' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'gestaoCotas.thPayment' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'gestaoCotas.thResult' | translate }}</th>
                <th class="px-4 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4,5]; track i) {
                  <tr class="border-b border-slate-100">
                    <td colspan="8" class="px-4 py-3">
                      <div class="h-4 bg-slate-100 rounded animate-pulse w-3/4"></div>
                    </td>
                  </tr>
                }
              } @else if (cotas().length === 0) {
                <tr>
                  <td colspan="8" class="px-4 py-12 text-center text-slate-400 text-sm">
                    @if (busca() || statusFiltro()) {
                      {{ 'gestaoCotas.emptyFiltered' | translate }}
                    } @else {
                      {{ 'gestaoCotas.emptyNone' | translate }}
                    }
                  </td>
                </tr>
              } @else {
                @for (cota of cotas(); track cota.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">

                    <!-- Nº -->
                    <td class="px-4 py-3 font-mono font-semibold text-[13px]">#{{ cota.numeroSequencial }}</td>

                    <!-- Participante -->
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                          {{ initials(cota.nomeIdentificacao) }}
                        </div>
                        <span class="font-semibold truncate max-w-[180px]">{{ cota.nomeIdentificacao }}</span>
                      </div>
                    </td>

                    <!-- Celular -->
                    <td class="px-4 py-3 font-mono text-slate-400 text-[12px]">{{ cota.numeroCelular | phone }}</td>

                    <!-- Palpites -->
                    <td class="px-4 py-3">
                      <div class="flex flex-wrap gap-[3px]">
                        @for (n of cota.palpites; track n) {
                          <span class="w-[22px] h-[22px] rounded-full flex items-center justify-center font-mono font-semibold text-[10px] border transition-colors"
                                [class]="numerosJaSorteados().has(n)
                                  ? 'bg-green-600 border-green-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-700'">
                            {{ pad(n) }}
                          </span>
                        }
                      </div>
                    </td>

                    <!-- Acertos (calculado client-side a partir dos sorteios carregados) -->
                    <td class="px-4 py-3">
                      <span class="font-mono font-bold tabular text-[14px]"
                            [class]="acertos(cota) >= 8 ? 'text-amber-600' : acertos(cota) >= 5 ? 'text-green-700' : ''">
                        {{ acertos(cota) }}{{ 'gestaoCotas.hitsOfTen' | translate }}
                      </span>
                    </td>

                    <!-- Pagamento -->
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                            [class]="statusClass(cota.statusPagamento)">
                        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                        @switch (cota.statusPagamento) {
                          @case ('PAGO') { {{ 'gestaoCotas.payStatusPAGO' | translate }} }
                          @case ('PENDENTE') { {{ 'gestaoCotas.payStatusPENDENTE' | translate }} }
                          @case ('INATIVO') { {{ 'gestaoCotas.payStatusINATIVO' | translate }} }
                        }
                      </span>
                    </td>

                    <!-- Resultado -->
                    <td class="px-4 py-3">
                      @if (cota.statusResultado === 'PREMIADO') {
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-amber-50 text-amber-700 border border-amber-100">
                          {{ 'gestaoCotas.badgeWinner' | translate }}
                        </span>
                      } @else if (cota.statusResultado === 'NAO_PREMIADO') {
                        <span class="text-slate-400 text-xs">{{ 'common.emDash' | translate }}</span>
                      } @else {
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 uppercase tracking-wide">
                          {{ 'gestaoCotas.inProgress' | translate }}
                        </span>
                      }
                    </td>

                    <!-- Ação -->
                    <td class="px-4 py-3">
                      @if (cota.statusPagamento === 'PENDENTE') {
                        <button (click)="confirmarPagamento(cota.id)"
                                [disabled]="confirmandoId() === cota.id"
                                class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-[12px] font-semibold rounded-lg transition-colors min-h-8">
                          {{ confirmandoId() === cota.id ? ('common.ellipsis' | translate) : ('gestaoCotas.confirmShort' | translate) }}
                        </button>
                      } @else {
                        <button class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm">
                          ⋯
                        </button>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-slate-400 text-xs">
            {{ 'gestaoCotas.showingQuotas' | translate: { shown: cotas().length, total: total() } }}
          </span>
          <div class="flex gap-1.5">
            <button (click)="prevPage()" [disabled]="page() <= 1 || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              {{ 'common.prevPlain' | translate }}
            </button>
            <span class="px-3 py-1.5 text-sm text-slate-500">{{ page() }} / {{ totalPages() }}</span>
            <button (click)="nextPage()" [disabled]="page() >= totalPages() || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              {{ 'common.nextPlain' | translate }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal: Nova Cota ──────────────────────────────────────────────────── -->
    @if (showModal()) {
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/40 z-40" (click)="closeModal()"></div>

      <!-- Slide-over panel: full-width mobile, 460px desktop -->
      <div class="fixed right-0 top-0 h-full w-full sm:w-[460px] bg-white shadow-xl z-50 flex flex-col overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="font-display font-semibold text-lg">{{ 'gestaoCotas.modalRegisterTitle' | translate }}</h2>
            <p class="text-slate-400 text-xs mt-0.5">{{ 'gestaoCotas.modalRegisterHint' | translate }}</p>
          </div>
          <button (click)="closeModal()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          <!-- Busca de participante -->
          <div class="relative">
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'gestaoCotas.searchParticipant' | translate }}</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input [ngModel]="buscaParticipante()" (ngModelChange)="onBuscaParticipanteChange($event)"
                     name="buscaParticipante" autocomplete="off"
                     class="w-full pl-8 pr-8 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                     [attr.placeholder]="'gestaoCotas.searchParticipantPh' | translate" />
              @if (buscandoParticipante()) {
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs animate-pulse">…</span>
              }
              @if (buscaParticipante() && !buscandoParticipante()) {
                <button type="button" (click)="limparBusca()"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs leading-none">✕</button>
              }
            </div>

            <!-- Dropdown de resultados -->
            @if (resultadosBusca().length > 0) {
              <div class="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                @for (p of resultadosBusca(); track p.id) {
                  <button type="button" (click)="selecionarParticipante(p)"
                          class="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors text-left border-b border-slate-100 last:border-0">
                    <div class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                      {{ initials(p.nome) }}
                    </div>
                    <div class="min-w-0">
                      <div class="font-semibold text-[13px] truncate">{{ p.nome }}</div>
                      <div class="text-[11px] text-slate-400 font-mono">{{ p.numeroCelular | phone }}</div>
                    </div>
                    <span class="ml-auto text-[10px] text-slate-400 flex-shrink-0">{{ 'gestaoCotas.cotasSuffix' | translate: { n: p.totalCotas } }}</span>
                  </button>
                }
                @if (totalResultados() > resultadosBusca().length) {
                  <div class="px-4 py-2 text-[11px] text-slate-400 text-center bg-slate-50">
                    {{ 'gestaoCotas.refineSearch' | translate: { n: totalResultados() - resultadosBusca().length } }}
                  </div>
                }
              </div>
            }
            @if (participanteVinculado()) {
              <p class="text-[11px] text-green-700 font-semibold mt-1.5 flex items-center gap-1">
                <span>✓</span> {{ 'gestaoCotas.selectedHint' | translate }}
                <button type="button" (click)="limparParticipante()" class="ml-auto text-slate-400 hover:text-slate-600">{{ 'gestaoCotas.swap' | translate }}</button>
              </p>
            }
          </div>

          <!-- Nome -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'gestaoCotas.nomeLabel' | translate }}</label>
            <input [ngModel]="novaNome()" (ngModelChange)="novaNome.set($event)" name="novaNome"
                   [readonly]="participanteVinculado()"
                   class="w-full px-3 py-2.5 border rounded-[10px] text-sm focus:outline-none uppercase transition-colors"
                   [class]="participanteVinculado()
                     ? 'border-green-200 bg-green-50 text-green-900 cursor-not-allowed'
                     : 'border-slate-200 focus:border-green-700'"
                   [attr.placeholder]="'gestaoCotas.nomePh' | translate" />
          </div>

          <!-- Celular -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'gestaoCotas.celularLabel' | translate }}</label>
            <input phoneMask [ngModel]="novaCelular()" (ngModelChange)="onCelularChange($event)" name="novaCelular"
                   type="tel" inputmode="numeric"
                   [readonly]="participanteVinculado()"
                   class="w-full px-3 py-2.5 border rounded-[10px] text-sm font-mono focus:outline-none transition-colors"
                   [class]="participanteVinculado()
                     ? 'border-green-200 bg-green-50 text-green-900 cursor-not-allowed'
                     : 'border-slate-200 focus:border-green-700'"
                   [attr.placeholder]="'gestaoCotas.celularPh' | translate" />
          </div>

          <!-- Abas de cotas -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-2 tracking-wide">{{ 'gestaoCotas.palpites' | translate }}</label>

            <!-- Tab headers + botão adicionar -->
            <div class="flex flex-wrap gap-1.5 mb-3">
              @for (cotas of todasCotas(); track $index) {
                <button type="button" (click)="cotaAtualIdx.set($index)"
                        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors"
                        [class]="cotaAtualIdx() === $index
                          ? 'bg-green-700 text-white border-green-700'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'">
                  {{ 'gestaoCotas.cotaTab' | translate: { n: $index + 1 } }}
                  <span class="font-mono" [class]="cotas.length === 10 ? 'text-green-300' : ''">
                    {{ cotas.length }}{{ 'gestaoCotas.hitsOfTen' | translate }}
                  </span>
                  @if (todasCotas().length > 1) {
                    <span (click)="$event.stopPropagation(); removerCota($index)"
                          class="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer">✕</span>
                  }
                </button>
              }
              <!-- Botão adicionar cota — inline com as abas -->
              <button type="button" (click)="adicionarCota()"
                      class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold border-2 border-dashed border-green-400 text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-600 transition-colors">
                {{ 'gestaoCotas.addQuotaTab' | translate }}
              </button>
            </div>

            <!-- Grid da cota ativa -->
            <div class="grid grid-cols-10 gap-1.5 p-4 bg-slate-50 rounded-xl border border-slate-200">
              @for (n of nums60; track n) {
                <button type="button" (click)="togglePalpite(n)"
                        class="w-full aspect-square rounded-full flex items-center justify-center font-mono font-semibold text-[11px] border transition-all"
                        [class]="todasCotas()[cotaAtualIdx()]?.includes(n)
                          ? 'bg-green-700 text-white border-green-700 shadow-sm scale-105'
                          : (todasCotas()[cotaAtualIdx()]?.length ?? 0) >= 10
                            ? 'bg-white text-slate-300 border-slate-200 cursor-not-allowed'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-green-400 hover:text-green-700'">
                  {{ pad(n) }}
                </button>
              }
            </div>

            <!-- Resumo da cota ativa -->
            @if ((todasCotas()[cotaAtualIdx()]?.length ?? 0) > 0) {
              <div class="mt-2 flex flex-wrap gap-1.5">
                @for (n of todasCotas()[cotaAtualIdx()]; track n) {
                  <span class="w-7 h-7 rounded-full flex items-center justify-center font-mono font-semibold text-[11px] bg-green-700 text-white">
                    {{ pad(n) }}
                  </span>
                }
              </div>
            }
          </div>

          @if (modalError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ modalError() }}</div>
          }
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-200 flex gap-2.5 flex-shrink-0">
          <button (click)="closeModal()" class="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-sm rounded-[10px] transition-colors">
            {{ 'common.cancel' | translate }}
          </button>
          <button (click)="cadastrarCota()"
                  [disabled]="!podeSubmitModal() || modalLoading()"
                  class="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm">
            {{ modalLoading() ? ('gestaoCotas.cadastrando' | translate) : (todasCotas().length > 1 ? ('gestaoCotas.cadastrarN' | translate: { n: todasCotas().length }) : ('gestaoCotas.cadastrar' | translate)) }}
          </button>
        </div>
      </div>
    }
  `,
})
export class GestaoCotasComponent implements OnInit {
  // Route param (withComponentInputBinding)
  readonly id = input<string>('');

  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  // ── List state ───────────────────────────────────────────────────────────────
  bolao         = signal<{ nome: string; valorCota: number } | null>(null);
  cotas         = signal<CotaResponse[]>([]);
  sorteios      = signal<{ bolasSorteadas: number[] }[]>([]);
  loading       = signal(false);
  error         = signal('');
  total         = signal(0);
  totalPages    = signal(0);
  page          = signal(1);
  busca         = signal('');
  statusFiltro  = signal('');
  confirmandoId = signal('');

  numerosJaSorteados = computed(() =>
    new Set(this.sorteios().flatMap(s => s.bolasSorteadas)),
  );

  // ── Computed KPIs ─────────────────────────────────────────────────────────────
  totalPago     = computed(() => this.cotas().filter(c => c.statusPagamento === 'PAGO').length);
  totalPendente = computed(() => this.cotas().filter(c => c.statusPagamento === 'PENDENTE').length);
  valorCotaRef  = 30; // TODO: from bolão API
  valorBruto    = computed(() => this.totalPago() * this.valorCotaRef);
  valorPendente = computed(() => this.totalPendente() * this.valorCotaRef);

  // ── Modal state ───────────────────────────────────────────────────────────────
  showModal             = signal(false);
  novaNome              = signal('');
  novaCelular           = signal('');
  todasCotas            = signal<number[][]>([[]]); // array of palpite arrays
  cotaAtualIdx          = signal(0);               // which cota grid is active
  modalLoading          = signal(false);
  modalError            = signal('');
  participanteVinculado = signal(false);
  buscandoParticipante  = signal(false);

  // busca de participante no modal
  buscaParticipante  = signal('');
  resultadosBusca    = signal<{ id: string; nome: string; numeroCelular: string; totalCotas: number }[]>([]);
  totalResultados    = signal(0);

  private celularTimeout: ReturnType<typeof setTimeout> | null = null;
  private buscaTimeout:   ReturnType<typeof setTimeout> | null = null;

  podeSubmitModal = computed(() =>
    this.novaNome().trim().length > 0 &&
    this.todasCotas().length > 0 &&
    this.todasCotas().every(p => p.length === 10),
  );

  // ── Helpers ───────────────────────────────────────────────────────────────────
  readonly nums60 = Array.from({ length: 60 }, (_, i) => i + 1);
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.UUID_RE.test(id)) {
        this.loadCotas();
      } else {
        this.resolveActiveBolao();
      }
    });
  }

  ngOnInit(): void {}

  private async resolveActiveBolao(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.api.get<{ data: { id: string }[] }>('/boloes?perPage=1'),
      );
      const first = res.data?.[0];
      if (first?.id) {
        await this.router.navigate(['/bolao', first.id, 'cotas'], { replaceUrl: true });
      } else {
        this.error.set(this.translate.instant('gestaoCotas.errNoBolao'));
        this.loading.set(false);
      }
    } catch {
      this.error.set(this.translate.instant('gestaoCotas.errLoadBolao'));
      this.loading.set(false);
    }
  }

  private get bolaoId(): string {
    return this.id();
  }

  // ── Data loading ──────────────────────────────────────────────────────────────
  async loadCotas(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const params = new URLSearchParams({
        page: String(this.page()),
        perPage: '50',
        ...(this.busca()       && { busca: this.busca() }),
        ...(this.statusFiltro() && { status: this.statusFiltro() }),
      });
      const [cotasRes, sorteiosRes, bolaoRes] = await Promise.all([
        firstValueFrom(this.api.get<Paginated<CotaResponse>>(`/boloes/${this.bolaoId}/cotas?${params}`)),
        firstValueFrom(this.api.get<{ bolasSorteadas: number[] }[]>(`/boloes/${this.bolaoId}/sorteios`)).catch(() => []),
        this.bolao() ? Promise.resolve(null) : firstValueFrom(this.api.get<{ nome: string; valorCota: number }>(`/boloes/${this.bolaoId}`)).catch(() => null),
      ]);
      this.cotas.set(cotasRes.data);
      this.total.set(cotasRes.total);
      this.totalPages.set(cotasRes.totalPages);
      this.sorteios.set(sorteiosRes);
      if (bolaoRes) this.bolao.set(bolaoRes);
    } catch {
      this.error.set(this.translate.instant('gestaoCotas.errLoadCotas'));
      this.cotas.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  onBuscaChange(value: string): void {
    this.busca.set(value);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.page.set(1);
      this.loadCotas();
    }, 400);
  }

  onStatusChange(value: string): void {
    this.statusFiltro.set(value);
    this.page.set(1);
    this.loadCotas();
  }

  prevPage(): void {
    if (this.page() > 1) { this.page.update(p => p - 1); this.loadCotas(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.loadCotas(); }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  async confirmarPagamento(cotaId: string): Promise<void> {
    this.confirmandoId.set(cotaId);
    try {
      await firstValueFrom(
        this.api.patch(`/boloes/${this.bolaoId}/cotas/${cotaId}/pagar`, {}),
      );
      this.cotas.update(cotas =>
        cotas.map(c => c.id === cotaId ? { ...c, statusPagamento: 'PAGO' as const } : c),
      );
    } catch {
      this.error.set(this.translate.instant('gestaoCotas.errConfirmPay'));
    } finally {
      this.confirmandoId.set('');
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────
  closeModal(): void {
    this.showModal.set(false);
    this.novaNome.set('');
    this.novaCelular.set('');
    this.todasCotas.set([[]]);
    this.cotaAtualIdx.set(0);
    this.modalError.set('');
    this.participanteVinculado.set(false);
    this.buscandoParticipante.set(false);
    this.buscaParticipante.set('');
    this.resultadosBusca.set([]);
    this.totalResultados.set(0);
  }

  onBuscaParticipanteChange(value: string): void {
    this.buscaParticipante.set(value);
    this.resultadosBusca.set([]);
    if (!value.trim()) return;

    if (this.buscaTimeout) clearTimeout(this.buscaTimeout);
    this.buscaTimeout = setTimeout(async () => {
      this.buscandoParticipante.set(true);
      try {
        const res = await firstValueFrom(
          this.api.get<{ data: { id: string; nome: string; numeroCelular: string; totalCotas: number }[]; total: number }>(
            `/participantes?busca=${encodeURIComponent(value.trim())}&perPage=6`,
          ),
        );
        this.resultadosBusca.set(res.data);
        this.totalResultados.set(res.total);
      } catch {
        this.resultadosBusca.set([]);
      } finally {
        this.buscandoParticipante.set(false);
      }
    }, 350);
  }

  selecionarParticipante(p: { nome: string; numeroCelular: string }): void {
    this.novaNome.set(p.nome);
    this.novaCelular.set(p.numeroCelular);
    this.participanteVinculado.set(true);
    this.resultadosBusca.set([]);
    this.buscaParticipante.set(p.nome);
  }

  limparBusca(): void {
    this.buscaParticipante.set('');
    this.resultadosBusca.set([]);
    this.totalResultados.set(0);
  }

  limparParticipante(): void {
    this.novaNome.set('');
    this.novaCelular.set('');
    this.participanteVinculado.set(false);
    this.buscaParticipante.set('');
    this.resultadosBusca.set([]);
  }

  onCelularChange(value: string): void {
    this.novaCelular.set(value);
    this.participanteVinculado.set(false);
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10) return;

    if (this.celularTimeout) clearTimeout(this.celularTimeout);
    this.celularTimeout = setTimeout(async () => {
      this.buscandoParticipante.set(true);
      try {
        const p = await firstValueFrom(
          this.api.get<{ nome: string } | null>(`/participantes/buscar-celular?celular=${digits}`),
        );
        if (p?.nome) {
          this.novaNome.set(p.nome);
          this.participanteVinculado.set(true);
        }
      } catch {
        // participante não encontrado — não faz nada
      } finally {
        this.buscandoParticipante.set(false);
      }
    }, 400);
  }

  togglePalpite(n: number): void {
    const idx = this.cotaAtualIdx();
    this.todasCotas.update(all => {
      const copy = all.map(p => [...p]);
      const cur = copy[idx];
      copy[idx] = cur.includes(n)
        ? cur.filter(x => x !== n)
        : cur.length < 10 ? [...cur, n].sort((a, b) => a - b) : cur;
      return copy;
    });
  }

  adicionarCota(): void {
    this.todasCotas.update(all => [...all, []]);
    this.cotaAtualIdx.set(this.todasCotas().length - 1);
  }

  removerCota(idx: number): void {
    if (this.todasCotas().length <= 1) return;
    this.todasCotas.update(all => all.filter((_, i) => i !== idx));
    const newLen = this.todasCotas().length;
    if (this.cotaAtualIdx() >= newLen) this.cotaAtualIdx.set(newLen - 1);
  }

  async cadastrarCota(): Promise<void> {
    if (!this.podeSubmitModal() || this.modalLoading()) return;
    this.modalLoading.set(true);
    this.modalError.set('');
    try {
      for (const palpites of this.todasCotas()) {
        await firstValueFrom(
          this.api.post(`/boloes/${this.bolaoId}/cotas`, {
            nomeIdentificacao: this.novaNome().trim().toUpperCase(),
            numeroCelular:     this.novaCelular().replace(/\D/g, '') || undefined,
            palpites,
          }),
        );
      }
      this.closeModal();
      await this.loadCotas();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message
        ?? this.translate.instant('gestaoCotas.errCadastrarCota');
      this.modalError.set(msg);
    } finally {
      this.modalLoading.set(false);
    }
  }

  // ── Template helpers ──────────────────────────────────────────────────────────
  acertos(cota: CotaResponse): number {
    const sorteados = this.numerosJaSorteados();
    return sorteados.size > 0
      ? cota.palpites.filter(n => sorteados.has(n)).length
      : cota.totalAcertosAcumulados;
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }

  initials(nome: string): string {
    return nome.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }

  statusClass(s: string): string {
    if (s === 'PAGO')    return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'INATIVO') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-700 border-amber-100'; // PENDENTE
  }
}

