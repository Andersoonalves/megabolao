import {
  Component, signal, computed, input, ChangeDetectionStrategy, inject, effect,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

interface Template {
  id: string;
  nome: string;
  conteudo: string;
  tipo: string;
  ativo: boolean;
}

interface Grupo {
  id: string;
  nome: string;
}

interface WaConfig {
  bolaoId: string;
  bolaoNome: string;
  grupos: Grupo[];
  configurado: boolean;
}

interface SessionInfo {
  status: string;
  numero?: string;
}

interface BolaoResumo {
  id: string;
  nome: string;
  status: string;
  totalCotasAtivas: number;
}

type GrupoTab = 'all' | 'bound' | 'free';

@Component({
  selector: 'nb-bolao-whatsapp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, BackButtonComponent, TranslatePipe],
  template: `
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex flex-wrap items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px] flex-1 min-w-0">
        <a routerLink="/boloes" class="text-slate-400 hover:text-slate-600 no-underline">{{ 'bolaoWhatsapp.breadcrumbPools' | translate }}</a>
        <span class="text-slate-300">›</span>
        @if (config()) {
          <a [routerLink]="['/bolao', id(), 'detalhes']" class="text-slate-400 hover:text-slate-600 no-underline truncate max-w-[180px]">
            {{ config()!.bolaoNome }}
          </a>
          <span class="text-slate-300">›</span>
        }
        <span class="font-semibold truncate">{{ 'bolaoWhatsapp.breadcrumbWa' | translate }}</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden truncate">{{ 'bolaoWhatsapp.breadcrumbWa' | translate }}</span>
      <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
        <a [routerLink]="['/whatsapp/nova-mensagem']" [queryParams]="{ bolaoId: id() }"
           class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-[10px] no-underline min-h-9">
          {{ 'bolaoWhatsapp.ctaSendMessage' | translate }}
        </a>
        <button type="button" (click)="syncGrupos()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] border-0 min-h-9 shadow-sm">
          {{ 'bolaoWhatsapp.ctaSync' | translate }}
        </button>
      </div>
    </div>

    <div class="p-4 lg:p-7 max-w-6xl">
      <!-- Cabeçalho -->
      <div class="mb-5 lg:mb-6">
        <div class="flex flex-wrap items-center gap-2.5 mb-2">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 text-green-800 text-[11px] font-semibold border border-green-100">
            {{ 'bolaoWhatsapp.badgePool' | translate }}
          </span>
          @if (bolao()) {
            <span class="text-[11.5px] text-slate-500">
              {{ statusLabel() }} · {{ bolao()!.totalCotasAtivas }} {{ 'bolaoWhatsapp.cotas' | translate }}
            </span>
          }
        </div>
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight text-slate-900">
          {{ 'bolaoWhatsapp.pageTitle' | translate }}
        </h1>
        <p class="text-slate-500 text-[13.5px] mt-1 max-w-3xl leading-relaxed">
          {{ 'bolaoWhatsapp.pageSubtitle' | translate }}
        </p>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div class="bg-white border border-slate-200 rounded-xl p-[18px]">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'bolaoWhatsapp.kpiLinked' | translate }}</div>
          <div class="font-display text-[26px] font-semibold tracking-tight mt-1 text-slate-900">{{ vinculadosCount() }}</div>
          <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'bolaoWhatsapp.kpiLinkedDelta' | translate: { n: grupos().length } }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-[18px]">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'bolaoWhatsapp.kpiFree' | translate }}</div>
          <div class="font-display text-[26px] font-semibold tracking-tight mt-1 text-slate-900">{{ disponiveisCount() }}</div>
          <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'bolaoWhatsapp.kpiFreeDelta' | translate }}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-[18px]">
          <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'bolaoWhatsapp.kpiHistory' | translate }}</div>
          <div class="font-display text-[26px] font-semibold tracking-tight mt-1 text-blue-600">→</div>
          <a routerLink="/whatsapp" class="text-[11.5px] text-blue-700 font-semibold hover:underline inline-block mt-0.5">
            {{ 'bolaoWhatsapp.kpiHistoryLink' | translate }}
          </a>
        </div>
      </div>

      <!-- Sessão -->
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 mb-5 rounded-xl border"
           [class]="session()?.status === 'CONECTADO' ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'">
        <span class="w-2.5 h-2.5 rounded-full shrink-0"
              [class]="session()?.status === 'CONECTADO' ? 'bg-green-600 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]' : 'bg-slate-300'"></span>
        <div class="flex-1 min-w-0 text-[12.5px]">
          @if (session()?.status === 'CONECTADO') {
            <strong class="text-green-900">{{ 'bolaoWhatsapp.sessionOk' | translate }}</strong>
            @if (session()?.numero) {
              <span class="text-slate-500 ml-2">+55 {{ session()!.numero }}</span>
            }
            <span class="text-slate-500 ml-2">· {{ grupos().length }} {{ 'bolaoWhatsapp.groupsInSession' | translate }}</span>
          } @else if (session()?.status === 'AGUARDANDO_QR') {
            <strong class="text-amber-800">{{ 'bolaoWhatsapp.sessionQr' | translate }}</strong>
          } @else if (session()?.status === 'CARREGANDO') {
            <strong class="text-slate-600">{{ 'bolaoWhatsapp.sessionLoading' | translate }}</strong>
          } @else {
            <strong class="text-slate-700">{{ 'bolaoWhatsapp.sessionOff' | translate }}</strong>
          }
        </div>
        <a routerLink="/whatsapp" class="text-[12px] font-semibold text-green-800 hover:underline no-underline shrink-0">
          {{ 'bolaoWhatsapp.manageSession' | translate }}
        </a>
      </div>

      @if (session()?.status !== 'CONECTADO') {
        <div class="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-900 leading-relaxed">
          {{ 'bolaoWhatsapp.warnConnect' | translate }}
          <a routerLink="/whatsapp" class="font-semibold underline ml-1">{{ 'bolaoWhatsapp.goWhatsapp' | translate }}</a>
        </div>
      } @else {
        <!-- Busca + filtros -->
        <div class="flex flex-col lg:flex-row gap-3 lg:items-center mb-3">
          <div class="relative flex-1 max-w-md">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input [ngModel]="grupoSearch()" (ngModelChange)="grupoSearch.set($event)" name="grupoSearch"
                   class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700"
                   [attr.placeholder]="'bolaoWhatsapp.searchPlaceholder' | translate" />
          </div>
          <div class="inline-flex p-1 bg-slate-100 rounded-lg self-start">
            @for (tab of tabs; track tab.k) {
              <button type="button" (click)="grupoTab.set(tab.k)"
                      class="px-3 py-1.5 rounded-md text-[11.5px] font-semibold border-0 cursor-pointer transition-all inline-flex items-center gap-1.5"
                      [class]="grupoTab() === tab.k ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'">
                {{ tab.labKey | translate }}
                <span class="font-mono text-[10px] opacity-60">{{ tabCount(tab.k) }}</span>
              </button>
            }
          </div>
        </div>

        <!-- Desktop: tabela (altura máxima + scroll) -->
        <div class="hidden lg:block bg-white border border-slate-200 rounded-xl mb-4 max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain">
          <table class="w-full text-[13px]">
            <thead class="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200 shadow-sm">
              <tr>
                <th class="w-14 px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'bolaoWhatsapp.thLink' | translate }}</th>
                <th class="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'bolaoWhatsapp.thGroup' | translate }}</th>
                <th class="w-36 px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'bolaoWhatsapp.thId' | translate }}</th>
                <th class="w-44 px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'bolaoWhatsapp.thStatus' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @if (loadingGrupos()) {
                @for (i of [1,2,3,4]; track i) {
                  <tr class="border-b border-slate-100">
                    <td class="px-4 py-3"><div class="w-5 h-5 bg-slate-100 rounded animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-4 bg-slate-100 rounded w-48 animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-slate-100 rounded w-28 animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-4 bg-slate-100 rounded w-24 animate-pulse"></div></td>
                  </tr>
                }
              } @else if (gruposExibidos().length === 0) {
                <tr>
                  <td colspan="4" class="px-4 py-10 text-center text-slate-400 text-sm">{{ emptyFilterMessage() }}</td>
                </tr>
              } @else {
                @for (g of gruposExibidos(); track g.id) {
                  <tr class="border-b border-slate-100 last:border-0 transition-colors"
                      [class]="estaSelecionado(g.id) ? 'bg-green-50/40' : 'hover:bg-slate-50/80'">
                    <td class="px-4 py-3 align-middle">
                      <input type="checkbox" class="w-4 h-4 accent-green-700 rounded border-slate-300 cursor-pointer"
                             [checked]="estaSelecionado(g.id)" (change)="toggleGrupo(g)" />
                    </td>
                    <td class="px-4 py-3 align-middle">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                              [class]="estaSelecionado(g.id) ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'">👥</span>
                        <span class="font-semibold text-slate-900 truncate">{{ g.nome }}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3 align-middle font-mono text-[11px] text-slate-400 truncate max-w-[9rem]">{{ g.id }}</td>
                    <td class="px-4 py-3 align-middle">
                      @if (estaSelecionado(g.id)) {
                        <span class="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-green-800">
                          <span class="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                          {{ 'bolaoWhatsapp.statusLinked' | translate }}
                        </span>
                      } @else {
                        <span class="text-[11.5px] text-slate-400">{{ 'bolaoWhatsapp.statusFree' | translate }}</span>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Mobile: cards (altura máxima + scroll) -->
        <div class="lg:hidden flex flex-col gap-3 mb-4 max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain pr-0.5">
          @if (loadingGrupos()) {
            @for (i of [1,2,3]; track i) {
              <div class="bg-white border border-slate-200 rounded-xl p-4 animate-pulse h-24"></div>
            }
          } @else if (gruposExibidos().length === 0) {
            <div class="text-center text-slate-400 text-sm py-8">{{ emptyFilterMessage() }}</div>
          } @else {
            @for (g of gruposExibidos(); track g.id) {
              <div class="bg-white border rounded-xl p-4 transition-colors"
                   [class]="estaSelecionado(g.id) ? 'border-green-200 ring-1 ring-green-100' : 'border-slate-200'">
                <label class="flex items-start gap-3 cursor-pointer min-h-12">
                  <input type="checkbox" class="w-5 h-5 mt-0.5 accent-green-700 shrink-0"
                         [checked]="estaSelecionado(g.id)" (change)="toggleGrupo(g)" />
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-slate-900">{{ g.nome }}</div>
                    <div class="font-mono text-[10px] text-slate-400 break-all mt-1">{{ g.id }}</div>
                    <div class="text-[11px] mt-2" [class]="estaSelecionado(g.id) ? 'text-green-800 font-semibold' : 'text-slate-400'">
                      {{ estaSelecionado(g.id) ? ('bolaoWhatsapp.statusLinked' | translate) : ('bolaoWhatsapp.statusFree' | translate) }}
                    </div>
                  </div>
                </label>
              </div>
            }
          }
        </div>

        <!-- Rodapé da lista -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 mb-5 bg-slate-50 border border-slate-200 rounded-xl text-[11.5px] text-slate-500">
          <span class="flex items-start gap-2">
            <span class="shrink-0">ℹ</span>
            <span>{{ 'bolaoWhatsapp.footerHint' | translate }}</span>
          </span>
          <div class="flex flex-wrap gap-2">
            <button type="button" (click)="syncGrupos()" [disabled]="loadingGrupos()"
                    class="inline-flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-10">
              ↻ {{ 'bolaoWhatsapp.ctaSync' | translate }}
            </button>
            <button type="button" (click)="salvar()" [disabled]="salvando() || !alterado()"
                    class="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[12px] font-semibold min-h-10 border-0"
                    [class]="alterado() ? 'bg-green-700 text-white hover:bg-green-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'">
              {{ salvando() ? ('bolaoWhatsapp.saving' | translate) : ('bolaoWhatsapp.save' | translate) }}
            </button>
          </div>
        </div>

        <!-- Ajuda em 2 colunas -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div class="bg-white border border-slate-200 rounded-xl p-4 flex gap-3">
            <div class="w-9 h-9 rounded-lg bg-green-50 text-green-700 flex items-center justify-center shrink-0 text-lg">✦</div>
            <div>
              <div class="text-[12.5px] font-semibold text-slate-900 mb-1">{{ 'bolaoWhatsapp.helpAutoTitle' | translate }}</div>
              <p class="text-[11.5px] text-slate-500 leading-relaxed">{{ 'bolaoWhatsapp.helpAutoBody' | translate }}</p>
            </div>
          </div>
          <div class="bg-white border border-slate-200 rounded-xl p-4 flex gap-3">
            <div class="w-9 h-9 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center shrink-0 text-lg">ⓘ</div>
            <div>
              <div class="text-[12.5px] font-semibold text-slate-900 mb-1">{{ 'bolaoWhatsapp.helpSharedTitle' | translate }}</div>
              <p class="text-[11.5px] text-slate-500 leading-relaxed">{{ 'bolaoWhatsapp.helpSharedBody' | translate }}</p>
            </div>
          </div>
        </div>

        <!-- Templates + envio rápido -->
        <div class="flex flex-col lg:flex-row gap-4 mb-6">
          <div class="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-slate-800">{{ 'bolaoWhatsapp.templatesTitle' | translate }}</p>
              <p class="text-[12px] text-slate-500 mt-0.5">{{ 'bolaoWhatsapp.templatesHint' | translate }}</p>
            </div>
            <a routerLink="/whatsapp/templates"
               class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline min-h-12 shrink-0">
              {{ 'bolaoWhatsapp.templatesLink' | translate }}
            </a>
          </div>
        </div>

        @if (config()?.grupos && config()!.grupos.length > 0) {
          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200">
              <h2 class="font-display font-semibold text-[15px]">{{ 'bolaoWhatsapp.quickSendTitle' | translate }}</h2>
              <p class="text-[12px] text-slate-500 mt-0.5">{{ 'bolaoWhatsapp.quickSendHint' | translate }}</p>
            </div>
            <div class="p-5 flex flex-col gap-4">
              @if (templates().length > 0) {
                <div>
                  <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'bolaoWhatsapp.useTemplate' | translate }}</label>
                  <select (change)="aplicarTemplate($event)"
                          class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-green-700">
                    <option value="">{{ 'bolaoWhatsapp.templateFree' | translate }}</option>
                    @for (t of templates(); track t.id) {
                      <option [value]="t.id">{{ t.nome }}</option>
                    }
                  </select>
                </div>
              }
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'bolaoWhatsapp.sendTo' | translate }}</label>
                <div class="flex flex-col gap-1.5">
                  @for (g of config()!.grupos; track g.id) {
                    <label class="flex items-center gap-2.5 cursor-pointer py-1 min-h-10">
                      <input type="checkbox" [checked]="gruposEnvio().includes(g.id)"
                             (change)="toggleGrupoEnvio(g.id)"
                             class="w-4 h-4 accent-green-700" />
                      <span class="text-[13.5px] font-semibold">{{ g.nome }}</span>
                    </label>
                  }
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'bolaoWhatsapp.messageLabel' | translate }}
                  <span class="text-slate-400 font-normal">({{ msgConteudo().length }}/4096)</span>
                </label>
                <textarea [ngModel]="msgConteudo()" (ngModelChange)="msgConteudo.set($event)" rows="5"
                          class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700 resize-y"
                          [attr.placeholder]="'bolaoWhatsapp.messagePh' | translate"></textarea>
              </div>
              @if (erroEnvio()) {
                <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ erroEnvio() }}</div>
              }
              @if (sucessoEnvio()) {
                <div class="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{{ sucessoEnvio() }}</div>
              }
              <button type="button" (click)="enviarMensagem()"
                      [disabled]="!msgConteudo().trim() || gruposEnvio().length === 0 || enviando()"
                      class="w-full py-3 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold text-sm rounded-[10px] min-h-12 border-0 shadow-sm">
                {{ enviando() ? ('bolaoWhatsapp.sending' | translate) : ('bolaoWhatsapp.sendBtn' | translate: { n: gruposEnvio().length } ) }}
              </button>
            </div>
          </div>
        }
      }

      @if (erro()) {
        <div class="mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ erro() }}</div>
      }
      @if (sucesso()) {
        <div class="mt-4 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{{ sucesso() }}</div>
      }
    </div>
  `,
})
export class BolaoWhatsappComponent {
  readonly id = input<string>('');
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  readonly tabs: { k: GrupoTab; labKey: string }[] = [
    { k: 'all', labKey: 'bolaoWhatsapp.tabAll' },
    { k: 'bound', labKey: 'bolaoWhatsapp.tabBound' },
    { k: 'free', labKey: 'bolaoWhatsapp.tabFree' },
  ];

  bolao = signal<BolaoResumo | null>(null);
  config = signal<WaConfig | null>(null);
  session = signal<SessionInfo | null>(null);
  grupos = signal<Grupo[]>([]);
  loadingGrupos = signal(false);
  salvando = signal(false);
  erro = signal('');
  sucesso = signal('');

  grupoSearch = signal('');
  grupoTab = signal<GrupoTab>('bound');

  templates = signal<Template[]>([]);
  gruposEnvio = signal<string[]>([]);
  msgConteudo = signal('');
  enviando = signal(false);
  erroEnvio = signal('');
  sucessoEnvio = signal('');

  selecionados = signal<Grupo[]>([]);

  vinculadosCount = computed(() => this.selecionados().length);

  disponiveisCount = computed(() => {
    const set = new Set(this.selecionados().map(g => g.id));
    return this.grupos().filter(g => !set.has(g.id)).length;
  });

  gruposExibidos = computed(() => {
    const all = this.grupos();
    const q = this.grupoSearch().trim().toLowerCase();
    let list = q
      ? all.filter(g => g.nome.toLowerCase().includes(q) || g.id.toLowerCase().includes(q))
      : [...all];
    const sel = new Set(this.selecionados().map(g => g.id));
    const tab = this.grupoTab();
    if (tab === 'bound') list = list.filter(g => sel.has(g.id));
    if (tab === 'free') list = list.filter(g => !sel.has(g.id));
    return list;
  });

  alterado = computed(() => {
    const salvo = (this.config()?.grupos ?? [])
      .map(g => g.id)
      .sort()
      .join(',');
    const atual = this.selecionados()
      .map(g => g.id)
      .sort()
      .join(',');
    return salvo !== atual;
  });

  constructor() {
    effect(() => {
      const bid = this.id();
      if (!bid) return;
      void this.loadAll(bid);
    });
  }

  tabCount(k: GrupoTab): number {
    const sel = new Set(this.selecionados().map(g => g.id));
    const all = this.grupos();
    const q = this.grupoSearch().trim().toLowerCase();
    const base = q
      ? all.filter(g => g.nome.toLowerCase().includes(q) || g.id.toLowerCase().includes(q))
      : [...all];
    if (k === 'all') return base.length;
    if (k === 'bound') return base.filter(g => sel.has(g.id)).length;
    return base.filter(g => !sel.has(g.id)).length;
  }

  emptyFilterMessage(): string {
    if (this.grupos().length === 0) return this.translate.instant('bolaoWhatsapp.emptyNoGroups');
    return this.translate.instant('bolaoWhatsapp.emptyFilter');
  }

  statusLabel(): string {
    const s = this.bolao()?.status;
    if (!s) return '';
    const k = `bolaoWhatsapp.status.${s}`;
    const t = this.translate.instant(k);
    return t !== k ? t : s;
  }

  private async loadAll(bid: string): Promise<void> {
    await Promise.all([this.loadBolao(bid), this.loadConfig(), this.loadSession(), this.loadTemplates()]);
  }

  private async loadBolao(bid: string): Promise<void> {
    try {
      this.bolao.set(await firstValueFrom(this.api.get<BolaoResumo>(`/boloes/${bid}`)));
    } catch {
      this.bolao.set(null);
    }
  }

  private async loadConfig(): Promise<void> {
    const bid = this.id();
    if (!bid) return;
    try {
      const c = await firstValueFrom(this.api.get<WaConfig>(`/boloes/${bid}/whatsapp`));
      this.config.set(c);
      this.selecionados.set([...c.grupos]);
      this.gruposEnvio.set(c.grupos.map(g => g.id));
    } catch {
      /* silencioso */
    }
  }

  private async loadTemplates(): Promise<void> {
    try {
      const ts = await firstValueFrom(this.api.get<Template[]>('/whatsapp/templates'));
      this.templates.set(ts.filter(t => t.ativo));
    } catch {
      /* silencioso */
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const s = await firstValueFrom(this.api.get<SessionInfo>('/whatsapp/sessao/status'));
      this.session.set(s);
      if (s.status === 'CONECTADO') await this.loadGrupos();
    } catch {
      /* silencioso */
    }
  }

  async loadGrupos(): Promise<void> {
    this.loadingGrupos.set(true);
    try {
      const g = await firstValueFrom(this.api.get<Grupo[]>('/whatsapp/sessao/grupos'));
      this.grupos.set(g);
    } catch {
      /* silencioso */
    } finally {
      this.loadingGrupos.set(false);
    }
  }

  async syncGrupos(): Promise<void> {
    await this.loadGrupos();
    await this.loadSession();
  }

  estaSelecionado(id: string): boolean {
    return this.selecionados().some(g => g.id === id);
  }

  toggleGrupo(g: Grupo): void {
    this.selecionados.update(atual =>
      this.estaSelecionado(g.id) ? atual.filter(x => x.id !== g.id) : [...atual, g],
    );
  }

  async salvar(): Promise<void> {
    if (!this.alterado() || this.salvando()) return;
    const bid = this.id();
    if (!bid) return;
    this.salvando.set(true);
    this.erro.set('');
    this.sucesso.set('');
    try {
      const c = await firstValueFrom(
        this.api.patch<WaConfig>(`/boloes/${bid}/whatsapp`, {
          grupos: this.selecionados(),
        }),
      );
      this.config.set(c);
      const n = c.grupos.length;
      this.sucesso.set(
        n > 0
          ? this.translate.instant('bolaoWhatsapp.saveOk', { n })
          : this.translate.instant('bolaoWhatsapp.saveEmpty'),
      );
      setTimeout(() => this.sucesso.set(''), 3000);
    } catch (err: unknown) {
      this.erro.set((err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('bolaoWhatsapp.saveErr'));
    } finally {
      this.salvando.set(false);
    }
  }

  toggleGrupoEnvio(grupoId: string): void {
    this.gruposEnvio.update(ids =>
      ids.includes(grupoId) ? ids.filter(x => x !== grupoId) : [...ids, grupoId],
    );
  }

  aplicarTemplate(event: Event): void {
    const tid = (event.target as HTMLSelectElement).value;
    if (!tid) return;
    const t = this.templates().find(x => x.id === tid);
    if (t) this.msgConteudo.set(t.conteudo);
  }

  async enviarMensagem(): Promise<void> {
    const bid = this.id();
    if (!bid || !this.msgConteudo().trim() || this.gruposEnvio().length === 0 || this.enviando()) return;
    this.enviando.set(true);
    this.erroEnvio.set('');
    this.sucessoEnvio.set('');
    try {
      for (const grupoId of this.gruposEnvio()) {
        await firstValueFrom(
          this.api.post('/whatsapp/mensagens', {
            grupoId,
            tipo: 'MANUAL',
            conteudo: this.msgConteudo().trim(),
            bolaoId: bid,
          }),
        );
      }
      this.sucessoEnvio.set(this.translate.instant('bolaoWhatsapp.sendOk', { n: this.gruposEnvio().length }));
      this.msgConteudo.set('');
      setTimeout(() => this.sucessoEnvio.set(''), 4000);
    } catch (err: unknown) {
      this.erroEnvio.set(
        (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('bolaoWhatsapp.sendErr'),
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
