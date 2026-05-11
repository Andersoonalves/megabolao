import {
  Component, ChangeDetectionStrategy, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

type WaStatus = 'DESCONECTADO' | 'CARREGANDO' | 'AGUARDANDO_QR' | 'CONECTADO';

interface SessionInfo { status: WaStatus; numero?: string; }
interface Grupo { id: string; nome: string; qtdParticipantes?: number; }

interface WaConfig {
  bolaoId: string;
  bolaoNome: string;
  grupos: Grupo[];
  configurado: boolean;
}

interface BolaoComWa {
  id: string;
  nome: string;
  status: string;
  totalCotasAtivas: number;
  grupos: Grupo[];
}
interface WaTemplateApi {
  id: string;
  nome: string;
  conteudo: string;
  tipo: string;
  ativo: boolean;
}

const MSG_TIPOS = ['MANUAL', 'RESULTADO_SORTEIO', 'RANKING_PARCIAL', 'PREMIADOS', 'AVISO_ADMIN'] as const;
type MsgTipo = (typeof MSG_TIPOS)[number];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTemplateKeys(conteudo: string): string[] {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(conteudo)) !== null) set.add(m[1].trim());
  return [...set];
}

function isMsgTipo(s: string): s is MsgTipo {
  return (MSG_TIPOS as readonly string[]).includes(s);
}

@Component({
  selector: 'nb-whatsapp-envio-mensagem',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, RouterLink, TranslatePipe],
  template: `
    <!-- Topbar (protótipo: breadcrumb + ações) -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex flex-wrap items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1 flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-2 text-[12.5px] min-w-0">
          <a routerLink="/whatsapp" class="text-slate-400 hover:text-slate-600 no-underline shrink-0">{{ 'whatsapp.brand' | translate }}</a>
          <span class="text-slate-300 shrink-0">›</span>
          <a routerLink="/whatsapp" class="text-slate-400 hover:text-slate-600 no-underline shrink-0">{{ 'whatsapp.title' | translate }}</a>
          <span class="text-slate-300 shrink-0">›</span>
          <span class="font-semibold truncate">{{ 'whatsappEnvio.breadcrumbNew' | translate }}</span>
        </div>
        <span class="font-display font-semibold text-[14px] sm:hidden truncate">{{ 'whatsappEnvio.breadcrumbNew' | translate }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2 shrink-0 ml-auto justify-end">
        <a routerLink="/whatsapp"
           class="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-[10px] border border-slate-200 no-underline min-h-10">
          {{ 'whatsappEnvio.cancel' | translate }}
        </a>
        <button type="button" disabled
                class="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-[10px] cursor-not-allowed min-h-10 opacity-70"
                [attr.title]="'whatsappEnvio.soon' | translate">
          {{ 'whatsappEnvio.saveDraft' | translate }}
        </button>
        <button type="button" (click)="enviar()"
                [disabled]="!podeEnviar() || sending()"
                class="inline-flex items-center gap-1.5 px-3 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-sm font-semibold rounded-[10px] shadow-sm min-h-10">
          {{ sending() ? ('whatsapp.sending' | translate) : ('whatsappEnvio.sendNowTop' | translate) }}
        </button>
      </div>
    </div>

    <div class="p-4 lg:p-7 max-w-[1200px] mx-auto pb-24">
      <!-- Cabeçalho da página -->
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div>
          <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight">{{ 'whatsappEnvio.pageTitle' | translate }}</h1>
          <p class="text-slate-500 text-[13.5px] mt-1">{{ 'whatsappEnvio.pageSubtitle' | translate }}</p>
        </div>
        @if (session()?.status === 'CONECTADO' && session()?.numero) {
          <div class="flex items-center gap-2 text-[11.5px] text-slate-500">
            <span class="text-green-700">✓</span>
            <span>{{ 'whatsappEnvio.sessionLine' | translate: { num: session()!.numero } }}</span>
          </div>
        }
      </div>

      @if (session()?.status !== 'CONECTADO') {
        <div class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-900">
          {{ 'whatsappEnvio.needConnect' | translate }}
          <a routerLink="/whatsapp" class="font-semibold text-green-800 underline ml-1">{{ 'whatsappEnvio.goWhatsapp' | translate }}</a>
        </div>
      }

      <!-- Alternador template / manual (segmentado) -->
      <div class="inline-flex p-1 bg-slate-100 rounded-xl mb-5">
        @for (m of modes; track m.k) {
          <button type="button" (click)="setMode(m.k)"
                  class="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-left transition-all min-h-12 border-0 cursor-pointer"
                  [class]="mode() === m.k
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'bg-transparent text-slate-500 hover:text-slate-700'">
            <span class="text-base">{{ m.icon }}</span>
            <span>
              <span class="block text-[12.5px] font-semibold leading-tight">{{ m.titleKey | translate }}</span>
              <span class="block text-[10.5px] font-medium mt-0.5"
                    [class]="mode() === m.k ? 'text-slate-500' : 'text-slate-400'">{{ m.descKey | translate }}</span>
            </span>
          </button>
        }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5 items-start">
        <!-- Coluna esquerda -->
        <div class="flex flex-col gap-4 min-w-0">

          @if (mode() === 'template') {
            <!-- Passo 1 — templates -->
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div class="px-[18px] py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="w-[22px] h-[22px] rounded-full bg-green-700 text-white flex items-center justify-center text-[11px] font-bold font-mono shrink-0">1</span>
                  <div>
                    <h3 class="font-display font-semibold text-[13.5px]">{{ 'whatsappEnvio.step1Title' | translate }}</h3>
                    <p class="text-[11px] text-slate-500 mt-0.5">{{ 'whatsappEnvio.step1Hint' | translate: { n: filteredTemplates().length } }}</p>
                  </div>
                </div>
                <div class="relative shrink-0">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                  <input [ngModel]="tplSearch()" (ngModelChange)="tplSearch.set($event)" name="tplSearch"
                         class="w-full sm:w-[180px] pl-7 pr-2 py-1.5 border border-slate-200 rounded-[10px] text-[11.5px] focus:outline-none focus:border-green-700"
                         [attr.placeholder]="'whatsappEnvio.searchTpl' | translate" />
                </div>
              </div>
              <div class="p-3.5 max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                @if (loading()) {
                  @for (i of [1,2,3,4]; track i) {
                    <div class="h-28 rounded-[10px] bg-slate-100 animate-pulse"></div>
                  }
                } @else if (filteredTemplates().length === 0) {
                  <div class="sm:col-span-2 py-10 text-center text-slate-500 text-sm">
                    {{ 'whatsappEnvio.noTemplates' | translate }}
                    <a routerLink="/whatsapp/templates" class="text-green-700 font-semibold ml-1 no-underline">{{ 'whatsapp.templatesCta' | translate }}</a>
                  </div>
                } @else {
                  @for (t of filteredTemplates(); track t.id) {
                    <button type="button" (click)="selectTemplate(t)"
                            class="flex flex-col items-stretch gap-2 p-3.5 rounded-[10px] text-left cursor-pointer border-[1.5px] transition-all"
                            [class]="selectedId() === t.id
                              ? 'border-green-600 bg-green-50 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'
                              : 'border-slate-200 bg-white hover:border-slate-300'">
                      <div class="flex justify-between gap-2 items-start">
                        <div class="min-w-0">
                          <div class="text-[13px] font-semibold truncate" [class]="selectedId() === t.id ? 'text-green-900' : 'text-slate-900'">{{ t.nome }}</div>
                          <div class="font-mono text-[10px] text-slate-400 tracking-wide">{{ t.tipo }}</div>
                        </div>
                        <span class="w-[18px] h-[18px] rounded-full shrink-0 border-[1.5px] flex items-center justify-center"
                              [class]="selectedId() === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-slate-200 bg-white'">
                          @if (selectedId() === t.id) { ✓ }
                        </span>
                      </div>
                      <p class="text-[11.5px] text-slate-500 leading-snug line-clamp-2">{{ t.conteudo }}</p>
                    </button>
                  }
                }
              </div>
              </div>
            </div>

            <!-- Passo 2 — variáveis -->
            @if (selected() && varKeys().length > 0) {
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div class="px-[18px] py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="w-[22px] h-[22px] rounded-full bg-green-700 text-white flex items-center justify-center text-[11px] font-bold font-mono shrink-0">2</span>
                    <div>
                      <h3 class="font-display font-semibold text-[13.5px]">{{ 'whatsappEnvio.step2Title' | translate }}</h3>
                      <p class="text-[11px] text-slate-500 mt-0.5">{{ 'whatsappEnvio.step2Hint' | translate }}</p>
                    </div>
                  </div>
                  <span class="text-[9.5px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-800 shrink-0">
                    {{ 'whatsappEnvio.filledBadge' | translate: { n: filledCount() } }}
                  </span>
                </div>
                <div class="p-[14px_18px] max-h-[min(45dvh,20rem)] overflow-y-auto overscroll-contain">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  @for (k of varKeys(); track k) {
                    <div [class]="fullWidthKey(k) ? 'sm:col-span-2' : ''">
                      <div class="flex justify-between mb-1">
                        <label class="text-[10.5px] font-semibold text-slate-500 flex items-center gap-1.5">
                          <span class="font-mono text-slate-400">{{ varBrace(k) }}</span>
                        </label>
                      </div>
                      <input [ngModel]="varVals()[k]" (ngModelChange)="setVar(k, $event)" [name]="'v-' + k"
                             class="w-full px-3 py-2 border border-slate-200 rounded-[10px] text-[12.5px] font-mono focus:outline-none focus:border-green-700" />
                    </div>
                  }
                </div>
                </div>
              </div>
            }

            <!-- Card manual inativo (eco do protótipo) -->
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden opacity-55">
              <div class="px-[18px] py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div class="flex items-center gap-2">
                  <span class="text-slate-500">✎</span>
                  <h3 class="font-display font-semibold text-[12.5px] text-slate-500">{{ 'whatsappEnvio.manualInactiveTitle' | translate }}</h3>
                </div>
                <span class="text-[11px] text-slate-400">{{ 'whatsappEnvio.manualInactiveHint' | translate }}</span>
              </div>
              <div class="px-[18px] py-4 font-mono text-[12px] text-slate-400 leading-relaxed">
                <span class="opacity-60">// {{ 'whatsappEnvio.manualInactiveCode' | translate }}</span>
              </div>
            </div>
          } @else {
            <!-- Modo manual -->
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div class="px-[18px] py-3.5 border-b border-slate-200">
                <h3 class="font-display font-semibold text-[13.5px]">{{ 'whatsappEnvio.manualEditorTitle' | translate }}</h3>
                <p class="text-[11px] text-slate-500 mt-0.5">{{ 'whatsappEnvio.manualEditorHint' | translate }}</p>
              </div>
              <div class="p-4">
                <textarea [ngModel]="manualContent()" (ngModelChange)="manualContent.set($event)" name="manualText" rows="14"
                          class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700 resize-y min-h-[200px]"
                          [attr.placeholder]="'whatsapp.msgPlaceholder' | translate"></textarea>
                <div class="text-right text-[11px] text-slate-400 mt-1">{{ manualContent().length }}/4096</div>
              </div>
            </div>
          }
        </div>

        <!-- Coluna direita (sticky): destinatários → quando → pré-visualização → enviar -->
        <aside class="flex flex-col gap-4 lg:sticky lg:top-24">
          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-200 flex flex-col gap-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="font-display font-semibold text-[12.5px]">{{ 'whatsappEnvio.recipientsTitle' | translate }}</h3>
                  <p class="text-[11px] text-slate-500 mt-0.5">
                    {{ recipientKind() === 'boloes' ? ('whatsappEnvio.recipientHintPools' | translate) : ('whatsappEnvio.recipientHintGroups' | translate) }}
                  </p>
                </div>
                @if (session()?.status === 'CONECTADO') {
                  <button type="button" (click)="toggleSelectAllRecipients()"
                          class="text-[11px] font-semibold text-slate-500 hover:text-green-700 px-2 py-0.5 rounded-lg shrink-0">
                    {{ allRecipientsSelected() ? ('whatsappEnvio.deselectAll' | translate) : ('whatsappEnvio.selectAll' | translate) }}
                  </button>
                }
              </div>
              <div class="inline-flex p-1 bg-slate-100 rounded-lg w-full">
                <button type="button" (click)="setRecipientKind('boloes')"
                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[11.5px] font-semibold border-0 cursor-pointer transition-all min-h-10"
                        [class]="recipientKind() === 'boloes' ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'">
                  🏆 {{ 'whatsappEnvio.tabPools' | translate }}
                </button>
                <button type="button" (click)="setRecipientKind('grupos')"
                        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[11.5px] font-semibold border-0 cursor-pointer transition-all min-h-10"
                        [class]="recipientKind() === 'grupos' ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'">
                  👥 {{ 'whatsappEnvio.tabGroups' | translate }}
                </button>
              </div>
            </div>

            @if (recipientKind() === 'grupos') {
              <div class="max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain">
                @if (loadingGrupos()) {
                  @for (i of [1,2,3,4,5]; track i) {
                    <div class="px-4 py-3 border-t border-slate-100 first:border-t-0">
                      <div class="h-4 bg-slate-100 rounded w-3/4 animate-pulse"></div>
                      <div class="h-3 bg-slate-100 rounded w-1/2 mt-2 animate-pulse"></div>
                    </div>
                  }
                } @else {
                  @for (g of grupos(); track g.id) {
                    <label class="flex items-center gap-2.5 px-4 py-2.5 border-t border-slate-100 first:border-t-0 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" class="w-4 h-4 accent-green-700 shrink-0 rounded"
                             [checked]="isGrupoSel(g.id)" (change)="toggleGrupo(g.id)" />
                      <div class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center text-xs shrink-0">👥</div>
                      <div class="min-w-0 flex-1">
                        <div class="text-[12.5px] font-semibold truncate">{{ g.nome }}</div>
                        @if (g.qtdParticipantes != null) {
                          <div class="text-[10.5px] text-slate-500 truncate">{{ 'whatsapp.groupMembers' | translate: { n: g.qtdParticipantes } }}</div>
                        }
                        <div class="text-[10.5px] text-slate-400">{{ 'whatsappEnvio.groupHint' | translate }}</div>
                      </div>
                    </label>
                  }
                  @if (grupos().length === 0) {
                    <div class="px-4 py-8 text-center text-slate-400 text-sm">{{ 'whatsapp.noGroups' | translate }}</div>
                  }
                }
              </div>
            } @else {
              <div class="max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain">
                @if (loadingBoloes()) {
                  @for (i of [1,2,3,4,5]; track i) {
                    <div class="px-4 py-3 border-t border-slate-100 first:border-t-0">
                      <div class="h-4 bg-slate-100 rounded w-2/3 animate-pulse"></div>
                      <div class="h-3 bg-slate-100 rounded w-1/2 mt-2 animate-pulse"></div>
                    </div>
                  }
                } @else {
                  @for (b of boloesWa(); track b.id; let idx = $index) {
                    <label class="flex items-center gap-2.5 px-4 py-2.5 border-t border-slate-100 first:border-t-0 cursor-pointer hover:bg-slate-50"
                           [class.opacity-55]="b.status === 'FINALIZADO'">
                      <input type="checkbox" class="w-4 h-4 accent-green-700 shrink-0 rounded"
                             [checked]="isBolaoSel(b.id)" [disabled]="b.grupos.length === 0" (change)="toggleBolao(b.id)" />
                      <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs"
                           [class]="isBolaoSel(b.id) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'">🏆</div>
                      <div class="min-w-0 flex-1">
                        <div class="text-[12.5px] font-semibold truncate">{{ b.nome }}</div>
                        <div class="text-[10.5px] text-slate-400">
                          {{ 'whatsappEnvio.poolMeta' | translate: { g: b.grupos.length, c: b.totalCotasAtivas } }}
                        </div>
                      </div>
                    </label>
                  }
                  @if (boloesWa().length === 0) {
                    <div class="px-4 py-8 text-center text-slate-400 text-sm">{{ 'whatsappEnvio.noPools' | translate }}</div>
                  }
                }
              </div>
            }

            <div class="px-4 py-2.5 border-t border-slate-100 bg-green-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              @if (recipientKind() === 'grupos') {
                <span class="text-[11px] text-green-900 leading-snug">
                  <strong class="font-semibold">{{ selectedGrupos().length }}</strong>
                  {{ 'whatsappEnvio.groupsSelected' | translate }}
                </span>
              } @else {
                <span class="text-[11px] text-green-900 leading-snug">
                  {{ 'whatsappEnvio.recipientFooterPoolsLine' | translate: { b: selectedBoloesRows().length, g: totalGruposEnvioBoloes() } }}
                </span>
                <span class="font-display text-[15px] font-bold text-green-800 tabular-nums shrink-0">
                  {{ cotasSelecionadasSoma() }} {{ 'whatsappEnvio.activeQuotasShort' | translate }}
                </span>
              }
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[12.5px]">{{ 'whatsappEnvio.whenTitle' | translate }}</h3>
            </div>
            <div class="p-2">
              <label class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer bg-green-50 mb-0.5">
                <input type="radio" name="when" value="now" [(ngModel)]="whenSend" class="accent-green-700" />
                <span class="text-lg">▶</span>
                <div>
                  <div class="text-[12.5px] font-semibold text-green-900">{{ 'whatsappEnvio.optNow' | translate }}</div>
                  <div class="text-[10.5px] text-slate-500">{{ 'whatsappEnvio.optNowDesc' | translate }}</div>
                </div>
              </label>
              <label class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-not-allowed opacity-45">
                <input type="radio" name="when" value="sched" disabled class="accent-green-700" />
                <span class="text-lg text-slate-400">🕐</span>
                <div>
                  <div class="text-[12.5px] font-semibold text-slate-600">{{ 'whatsappEnvio.optSched' | translate }}</div>
                  <div class="text-[10.5px] text-slate-400">{{ 'whatsappEnvio.soon' | translate }}</div>
                </div>
              </label>
              <label class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-not-allowed opacity-45">
                <input type="radio" name="when" value="next" disabled class="accent-green-700" />
                <span class="text-lg text-slate-400">↻</span>
                <div>
                  <div class="text-[12.5px] font-semibold text-slate-600">{{ 'whatsappEnvio.optNext' | translate }}</div>
                  <div class="text-[10.5px] text-slate-400">{{ 'whatsappEnvio.soon' | translate }}</div>
                </div>
              </label>
            </div>
          </div>

          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-sm">👁</span>
                <h3 class="font-display font-semibold text-[12.5px]">{{ 'whatsappEnvio.previewTitle' | translate }}</h3>
              </div>
              @if (previewContextLabel()) {
                <span class="text-[10.5px] text-slate-400 truncate max-w-[220px]">{{ previewContextLabel() }}</span>
              }
            </div>
            <div class="relative min-h-[200px] max-h-[min(42dvh,20rem)] overflow-y-auto overscroll-contain p-3.5 bg-gradient-to-b from-[#ece5dd] to-[#d9d1c4]">
              <div class="absolute inset-0 opacity-60 pointer-events-none"
                   style="background-image: radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px); background-size: 10px 10px;"></div>
              <div class="relative max-w-[280px]">
                <div class="bg-white rounded-[10px] rounded-bl-sm px-3 py-2.5 shadow text-[11.5px] leading-snug text-neutral-900 whitespace-pre-wrap break-words">
                  <div class="text-[10.5px] font-semibold text-green-700 mb-1">{{ 'whatsapp.brand' | translate }}</div>
                  {{ previewBody() || ('whatsappEnvio.previewEmpty' | translate) }}
                  <div class="text-right text-[9.5px] text-neutral-400 mt-1">—</div>
                </div>
              </div>
            </div>
            @if (recipientKind() === 'boloes' && selectedBoloes().length > 1) {
              <div class="px-4 py-2.5 border-t border-amber-200 bg-amber-50 text-[11px] text-amber-950 flex gap-2 items-start leading-snug">
                <span class="shrink-0 text-amber-700">ⓘ</span>
                <span>{{ 'whatsappEnvio.previewMultiPools' | translate: { n: selectedBoloes().length } }}</span>
              </div>
            }
            <div class="px-4 py-2.5 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
              <span><span class="font-mono text-slate-800">{{ previewBody().length }}</span> {{ 'whatsappEnvio.chars' | translate }}</span>
              <span>{{ 'whatsappEnvio.previewMeta' | translate }}</span>
            </div>
          </div>

          <button type="button" (click)="enviar()"
                  [disabled]="!podeEnviar() || sending()"
                  class="w-full py-3.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-[13.5px] font-semibold rounded-[10px] shadow-sm min-h-12">
            {{ sending() ? ('whatsapp.sending' | translate) : sendLabel() }}
          </button>

          @if (pageError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ pageError() }}</div>
          }
        </aside>
      </div>
    </div>
  `,
})
export class WhatsappEnvioMensagemComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly modes = [
    { k: 'template' as const, icon: '📄', titleKey: 'whatsappEnvio.modeTpl', descKey: 'whatsappEnvio.modeTplDesc' },
    { k: 'manual' as const, icon: '✎', titleKey: 'whatsappEnvio.modeManual', descKey: 'whatsappEnvio.modeManualDesc' },
  ];

  session = signal<SessionInfo | null>(null);
  grupos = signal<Grupo[]>([]);
  boloesWa = signal<BolaoComWa[]>([]);
  templates = signal<WaTemplateApi[]>([]);
  loading = signal(true);
  loadingGrupos = signal(false);
  loadingBoloes = signal(false);
  sending = signal(false);
  pageError = signal('');

  mode = signal<'template' | 'manual'>('template');
  tplSearch = signal('');
  selectedId = signal<string | null>(null);
  varVals = signal<Record<string, string>>({});
  manualContent = signal('');
  selectedGrupos = signal<string[]>([]);
  /** Destino: bolões (grupos vinculados a cada um) ou grupos da sessão. */
  recipientKind = signal<'boloes' | 'grupos'>('boloes');
  selectedBoloes = signal<string[]>([]);
  whenSend = 'now';

  private bolaoIdFromQuery: string | null = null;

  selected = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.templates().find(t => t.id === id) ?? null;
  });

  filteredTemplates = computed(() => {
    const q = this.tplSearch().trim().toLowerCase();
    const list = this.templates();
    if (!q) return list;
    return list.filter(t =>
      t.nome.toLowerCase().includes(q) || t.tipo.toLowerCase().includes(q) || t.conteudo.toLowerCase().includes(q),
    );
  });

  varKeys = computed(() => {
    const t = this.selected();
    if (!t) return [] as string[];
    return extractTemplateKeys(t.conteudo);
  });

  filledCount = computed(() => {
    const vals = this.varVals();
    return this.varKeys().filter(k => (vals[k] ?? '').trim().length > 0).length;
  });

  selectedBoloesRows = computed(() => {
    const set = new Set(this.selectedBoloes());
    return this.boloesWa().filter(b => set.has(b.id));
  });

  allRecipientsSelected = computed(() => {
    if (this.recipientKind() === 'grupos') {
      const g = this.grupos();
      const s = this.selectedGrupos();
      return g.length > 0 && s.length === g.length;
    }
    const selectable = this.boloesWa().filter(b => b.grupos.length > 0);
    const sel = new Set(this.selectedBoloes());
    return selectable.length > 0 && selectable.every(b => sel.has(b.id));
  });

  cotasSelecionadasSoma = computed(() =>
    this.selectedBoloesRows().reduce((s, b) => s + b.totalCotasAtivas, 0),
  );

  totalGruposEnvioBoloes = computed(() =>
    this.selectedBoloesRows().reduce((s, b) => s + b.grupos.length, 0),
  );

  sendLabel = computed(() => {
    if (this.recipientKind() === 'grupos') {
      return this.translate.instant('whatsappEnvio.sendToN', { n: this.selectedGrupos().length });
    }
    const rows = this.selectedBoloesRows();
    const nB = rows.length;
    const nG = this.totalGruposEnvioBoloes();
    return this.translate.instant('whatsappEnvio.sendToPoolsLine', { b: nB, g: nG });
  });

  previewBody = computed(() => this.buildMessage());

  previewContextLabel = computed(() => {
    if (this.recipientKind() === 'boloes') {
      const rows = this.selectedBoloesRows();
      if (rows.length === 0) return '';
      return this.translate.instant('whatsappEnvio.previewExamplePool', { nome: rows[0].nome });
    }
    const ids = this.selectedGrupos();
    if (ids.length === 0) return '';
    const nome = this.grupos().find(g => g.id === ids[0])?.nome ?? '';
    return this.translate.instant('whatsappEnvio.previewExampleGroup', { nome });
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.bolaoIdFromQuery = this.route.snapshot.queryParamMap.get('bolaoId');
    this.loading.set(true);
    await Promise.all([
      this.loadSession(),
      this.loadGrupos(),
      this.loadTemplates(),
      this.loadBoloesComWa(),
    ]);
    this.loading.set(false);
    const ids = this.grupos().map(g => g.id);
    if (ids.length > 0) {
      this.selectedGrupos.set([...ids]);
    }
    if (this.bolaoIdFromQuery) {
      const hit = this.boloesWa().find(b => b.id === this.bolaoIdFromQuery);
      if (hit) {
        this.recipientKind.set('boloes');
        this.selectedBoloes.set([this.bolaoIdFromQuery]);
      }
    }
    const list = this.templates();
    if (list.length > 0 && !this.selectedId()) {
      this.selectTemplate(list[0]);
    }
  }

  private async loadBoloesComWa(): Promise<void> {
    this.loadingBoloes.set(true);
    try {
      const res = await firstValueFrom(
        this.api.get<{ data: { id: string; nome: string; status: string; totalCotasAtivas: number }[] }>(
          '/boloes?perPage=100&page=1',
        ),
      );
      const data = res.data ?? [];
      const rows = await Promise.all(
        data.map(async b => {
          try {
            const wa = await firstValueFrom(this.api.get<WaConfig>(`/boloes/${b.id}/whatsapp`));
            return { ...b, grupos: wa.grupos } satisfies BolaoComWa;
          } catch {
            return { ...b, grupos: [] } satisfies BolaoComWa;
          }
        }),
      );
      this.boloesWa.set(rows);
    } catch {
      this.boloesWa.set([]);
    } finally {
      this.loadingBoloes.set(false);
    }
  }

  setRecipientKind(k: 'boloes' | 'grupos'): void {
    this.recipientKind.set(k);
  }

  isBolaoSel(id: string): boolean {
    return this.selectedBoloes().includes(id);
  }

  toggleBolao(id: string): void {
    this.selectedBoloes.update(arr =>
      arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id],
    );
  }

  toggleSelectAllRecipients(): void {
    if (this.recipientKind() === 'grupos') {
      const g = this.grupos();
      if (this.allRecipientsSelected()) {
        this.selectedGrupos.set([]);
      } else {
        this.selectedGrupos.set(g.map(x => x.id));
      }
      return;
    }
    const selectable = this.boloesWa().filter(b => b.grupos.length > 0);
    if (this.allRecipientsSelected()) {
      this.selectedBoloes.set([]);
    } else {
      this.selectedBoloes.set(selectable.map(b => b.id));
    }
  }

  private flattenEnvios(): { grupoId: string; bolaoId?: string }[] {
    if (this.recipientKind() === 'grupos') {
      const q = this.bolaoIdFromQuery;
      return this.selectedGrupos().map(grupoId => (q ? { grupoId, bolaoId: q } : { grupoId }));
    }
    const out: { grupoId: string; bolaoId: string }[] = [];
    for (const b of this.selectedBoloesRows()) {
      for (const gr of b.grupos) {
        out.push({ grupoId: gr.id, bolaoId: b.id });
      }
    }
    return out;
  }

  private async loadSession(): Promise<void> {
    try {
      this.session.set(await firstValueFrom(this.api.get<SessionInfo>('/whatsapp/sessao/status')));
    } catch {
      this.session.set({ status: 'DESCONECTADO' });
    }
  }

  private async loadGrupos(): Promise<void> {
    this.loadingGrupos.set(true);
    try {
      this.grupos.set(await firstValueFrom(this.api.get<Grupo[]>('/whatsapp/sessao/grupos')));
    } catch {
      this.grupos.set([]);
    } finally {
      this.loadingGrupos.set(false);
    }
  }

  private async loadTemplates(): Promise<void> {
    try {
      const ts = await firstValueFrom(this.api.get<WaTemplateApi[]>('/whatsapp/templates'));
      this.templates.set(ts.filter(t => t.ativo));
    } catch {
      this.templates.set([]);
    }
  }

  selectTemplate(t: WaTemplateApi): void {
    this.selectedId.set(t.id);
    const keys = extractTemplateKeys(t.conteudo);
    const next: Record<string, string> = {};
    const prev = this.varVals();
    for (const k of keys) next[k] = prev[k] ?? '';
    this.varVals.set(next);
  }

  setVar(key: string, value: string): void {
    this.varVals.update(m => ({ ...m, [key]: value }));
  }

  fullWidthKey(k: string): boolean {
    return k.toLowerCase().includes('numeros') || k.toLowerCase().includes('bolas') || k.length > 18;
  }

  isGrupoSel(id: string): boolean {
    return this.selectedGrupos().includes(id);
  }

  toggleGrupo(id: string): void {
    this.selectedGrupos.update(arr =>
      arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id],
    );
  }

  setMode(m: 'template' | 'manual'): void {
    this.mode.set(m);
  }

  varBrace(k: string): string {
    return `{{${k}}}`;
  }

  buildMessage(): string {
    if (this.mode() === 'manual') return this.manualContent().trim();
    const t = this.selected();
    if (!t) return '';
    let s = t.conteudo;
    const vals = this.varVals();
    for (const k of Object.keys(vals)) {
      const re = new RegExp(`\\{\\{\\s*${escapeRe(k)}\\s*\\}\\}`, 'g');
      s = s.replace(re, vals[k] ?? '');
    }
    return s.trim();
  }

  msgTipoAtual(): MsgTipo {
    if (this.mode() === 'manual') return 'MANUAL';
    const t = this.selected();
    return t && isMsgTipo(t.tipo) ? t.tipo : 'MANUAL';
  }

  podeEnviar(): boolean {
    if (this.session()?.status !== 'CONECTADO') return false;
    if (this.flattenEnvios().length === 0) return false;
    const body = this.buildMessage();
    if (!body || body.length > 4096) return false;
    if (this.mode() === 'template' && !this.selected()) return false;
    return true;
  }

  async enviar(): Promise<void> {
    if (!this.podeEnviar() || this.sending()) return;
    this.sending.set(true);
    this.pageError.set('');
    const body = this.buildMessage();
    const tipo = this.msgTipoAtual();
    const destinos = this.flattenEnvios();
    try {
      for (const d of destinos) {
        await firstValueFrom(
          this.api.post('/whatsapp/mensagens', {
            grupoId: d.grupoId,
            tipo,
            conteudo: body,
            ...(d.bolaoId ? { bolaoId: d.bolaoId } : {}),
          }),
        );
      }
      await this.router.navigate(['/whatsapp']);
    } catch (err: unknown) {
      this.pageError.set(
        (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('whatsapp.queueError'),
      );
    } finally {
      this.sending.set(false);
    }
  }
}
