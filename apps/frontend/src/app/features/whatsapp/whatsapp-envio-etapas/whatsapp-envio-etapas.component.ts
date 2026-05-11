import {
  Component, ChangeDetectionStrategy, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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

/** Último sorteio do bolão (por sequência no bolão) — vindo do dashboard. */
interface SorteioResumo {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

/** Resposta mínima de GET /boloes/:id/dashboard para preencher variáveis de template. */
interface DashboardEnvioSlice {
  valorBruto: number;
  sorteios: SorteioResumo[];
}

/** Cache por bolão: preenchido ao entrar no passo 3. */
interface BolaoWaTemplateHints {
  ultimoSorteio: SorteioResumo | null;
  valorBruto: number | null;
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

function fmtDataSorteioPt(isoYmd: string): string {
  const part = isoYmd.split('T')[0]?.trim() ?? isoYmd;
  const [y, m, d] = part.split('-');
  if (!y || !m || !d || y.length !== 4) return isoYmd;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function fmtBolasSorteio(bolas: number[]): string {
  return bolas.map(n => String(n).padStart(2, '0')).join(', ');
}

function formatBrlPt(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function isMsgTipo(s: string): s is MsgTipo {
  return (MSG_TIPOS as readonly string[]).includes(s);
}

type WizardStep = 1 | 2 | 3;

@Component({
  selector: 'nb-whatsapp-envio-etapas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex flex-wrap items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1 flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-2 text-[12.5px] min-w-0">
          <a routerLink="/whatsapp" class="text-slate-400 hover:text-slate-600 no-underline shrink-0">{{ 'whatsapp.brand' | translate }}</a>
          <span class="text-slate-300 shrink-0">›</span>
          <a routerLink="/whatsapp" class="text-slate-400 hover:text-slate-600 no-underline shrink-0">{{ 'whatsapp.title' | translate }}</a>
          <span class="text-slate-300 shrink-0">›</span>
          <span class="font-semibold truncate">{{ 'whatsappWizard.breadcrumb' | translate }}</span>
        </div>
        <span class="font-display font-semibold text-[14px] sm:hidden truncate">{{ 'whatsappWizard.breadcrumb' | translate }}</span>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0 ml-auto justify-end">
        <a routerLink="/whatsapp" class="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-[10px] border border-slate-200 no-underline min-h-10">
          {{ 'whatsappEnvio.cancel' | translate }}
        </a>
        @if (step() === 3) {
          <button type="button" (click)="enviar()" [disabled]="!podeEnviar() || sending()"
                  class="inline-flex items-center gap-1.5 px-3 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-sm font-semibold rounded-[10px] shadow-sm min-h-10">
            {{ sending() ? ('whatsapp.sending' | translate) : ('whatsappWizard.sendNow' | translate) }}
          </button>
        }
      </div>
    </div>

    <div class="p-4 lg:p-7 max-w-[1200px] mx-auto pb-24">
      <div class="mb-6">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight">{{ 'whatsappWizard.pageTitle' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px] mt-1">{{ 'whatsappWizard.pageSubtitle' | translate }}</p>
      </div>

      @if (session()?.status !== 'CONECTADO') {
        <div class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-900">
          {{ 'whatsappEnvio.needConnect' | translate }}
          <a routerLink="/whatsapp" class="font-semibold text-green-800 underline ml-1">{{ 'whatsappEnvio.goWhatsapp' | translate }}</a>
        </div>
      }

      <!-- Stepper -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap mb-6 px-1">
        @for (s of stepperItems(); track s.n) {
          <div class="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 sm:flex-initial sm:max-w-[13rem]">
            <span class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold font-mono border-2"
                  [class]="stepCircleClass(s.state)">
              @if (s.state === 'done') { ✓ } @else { {{ s.n }} }
            </span>
            <div class="min-w-0">
              <div class="text-[12.5px] font-semibold leading-tight" [class.text-slate-400]="s.state === 'todo'">{{ s.labKey | translate }}</div>
              <div class="text-[10.5px] text-slate-400 leading-snug">{{ s.descKey | translate }}</div>
            </div>
          </div>
          @if (s.n < 3) {
            <div class="hidden sm:block flex-1 h-px bg-slate-200 min-w-[24px] self-center"></div>
          }
        }
      </div>

      <!-- Step 1 -->
      @if (step() === 1) {
        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div class="px-[18px] py-3.5 border-b border-slate-200">
            <h3 class="font-display font-semibold text-[14px]">{{ 'whatsappWizard.step1Title' | translate }}</h3>
            <p class="text-[11px] text-slate-500 mt-0.5">{{ 'whatsappWizard.step1Hint' | translate }}</p>
          </div>
          <div class="max-h-[min(55dvh,24rem)] overflow-y-auto overscroll-contain p-3">
            @if (loadingBoloes()) {
              @for (i of [1,2,3,4]; track i) {
                <div class="h-16 rounded-lg bg-slate-100 animate-pulse mb-2"></div>
              }
            } @else {
              @for (b of boloesWa(); track b.id) {
                <label class="flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer border mb-2 transition-colors"
                       [class]="isBolaoSel(b.id) ? 'border-green-200 bg-green-50/50' : 'border-slate-100 hover:bg-slate-50'"
                       [class.opacity-50]="b.status === 'FINALIZADO' || b.grupos.length === 0">
                  <input type="checkbox" class="w-4 h-4 accent-green-700 shrink-0 rounded"
                         [checked]="isBolaoSel(b.id)" [disabled]="b.grupos.length === 0" (change)="toggleBolao(b.id)" />
                  <span class="text-lg shrink-0">🏆</span>
                  <div class="min-w-0 flex-1">
                    <div class="text-[13px] font-semibold truncate">{{ b.nome }}</div>
                    <div class="text-[10.5px] text-slate-400">
                      {{ 'whatsappWizard.poolMeta' | translate: { g: b.grupos.length, c: b.totalCotasAtivas } }}
                    </div>
                  </div>
                </label>
              }
              @if (boloesWa().length === 0) {
                <p class="text-center text-slate-400 text-sm py-8">{{ 'whatsappWizard.noPools' | translate }}</p>
              }
            }
          </div>
          <div class="px-4 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
            <button type="button" (click)="goStep2()" [disabled]="selectedBoloesRows().length === 0"
                    class="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-sm font-semibold rounded-[10px] min-h-12">
              {{ 'whatsappWizard.nextGroups' | translate }}
            </button>
          </div>
        </div>
      }

      <!-- Step 2 -->
      @if (step() === 2) {
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0">
            <div class="px-[18px] py-3.5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 class="font-display font-semibold text-[13.5px]">{{ 'whatsappWizard.step2Title' | translate }}</h3>
                <p class="text-[11px] text-slate-500 mt-0.5">{{ 'whatsappWizard.step2Hint' | translate }}</p>
              </div>
              <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-green-50 text-green-800 border border-green-100 shrink-0">
                {{ resumoStep2() }}
              </span>
            </div>
            <div class="max-h-[min(55dvh,28rem)] overflow-y-auto overscroll-contain">
              @for (b of rowsStep2(); track b.id; let bi = $index) {
                <div [class.border-t]="bi > 0" class="border-slate-100">
                  <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
                    <span class="text-base">🏆</span>
                    <span class="text-[12.5px] font-semibold flex-1 min-w-0 truncate">{{ b.nome }}</span>
                    <button type="button" (click)="toggleAllGruposBolao(b.id, false)"
                            class="text-[11px] font-semibold text-slate-500 hover:text-green-700 px-2 py-1 rounded-lg">
                      {{ 'whatsappWizard.clearAllGroups' | translate }}
                    </button>
                  </div>
                  @for (g of b.grupos; track g.id; let gi = $index) {
                    <label class="flex items-center gap-3 px-4 py-2.5 pl-7 cursor-pointer border-t border-dashed border-slate-100 hover:bg-slate-50/80">
                      <input type="checkbox" class="w-4 h-4 accent-green-700 shrink-0 rounded"
                             [checked]="isGrupoSel(b.id, g.id)" (change)="toggleGrupoBolao(b.id, g.id)" />
                      <span class="text-sm shrink-0">👥</span>
                      <div class="min-w-0 flex-1">
                        <div class="text-[12.5px] font-semibold truncate">{{ g.nome }}</div>
                        @if (g.qtdParticipantes != null) {
                          <div class="text-[10.5px] text-slate-500 truncate">{{ 'whatsapp.groupMembers' | translate: { n: g.qtdParticipantes } }}</div>
                        }
                        <div class="text-[10px] text-slate-400 font-mono truncate">{{ g.id }}</div>
                      </div>
                    </label>
                  }
                </div>
              }
            </div>
            <div class="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
              <button type="button" (click)="step.set(1)"
                      class="inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white border border-slate-200 rounded-[10px] min-h-10">
                ← {{ 'whatsappWizard.backPools' | translate }}
              </button>
              <button type="button" (click)="goStep3()" [disabled]="totalEnvios() === 0"
                      class="inline-flex items-center justify-center gap-1 px-4 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-sm font-semibold rounded-[10px] min-h-12">
                {{ 'whatsappWizard.nextContent' | translate }}
              </button>
            </div>
          </div>

          <aside class="flex flex-col gap-4 lg:sticky lg:top-24">
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div class="px-4 py-3 border-b border-slate-200">
                <h3 class="font-display font-semibold text-[12.5px]">{{ 'whatsappWizard.summaryTitle' | translate }}</h3>
              </div>
              <div class="px-4 py-3 space-y-3 text-[12px]">
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{{ 'whatsappWizard.summaryPools' | translate }}</div>
                  <div class="flex flex-wrap gap-1">
                    @for (b of selectedBoloesRows(); track b.id) {
                      <span class="inline-flex px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 text-[11px] font-semibold border border-amber-100">{{ b.nome }}</span>
                    }
                  </div>
                </div>
                <div class="border-t border-slate-100 pt-3 space-y-1.5">
                  <div class="flex justify-between"><span class="text-slate-500">{{ 'whatsappWizard.summaryPoolCount' | translate }}</span><span class="font-mono font-semibold">{{ selectedBoloesRows().length }}</span></div>
                  <div class="flex justify-between"><span class="text-slate-500">{{ 'whatsappWizard.summaryGroupCount' | translate }}</span><span class="font-mono font-semibold">{{ totalGruposSel() }}</span></div>
                  <div class="flex justify-between items-baseline pt-1">
                    <span class="font-semibold">{{ 'whatsappWizard.summaryReach' | translate }}</span>
                    <span class="font-display text-lg font-bold text-green-700 tabular-nums">{{ cotasSomadas() }}</span>
                  </div>
                  <p class="text-[10px] text-slate-400">{{ 'whatsappWizard.summaryReachHint' | translate }}</p>
                </div>
              </div>
            </div>
            <div class="p-3.5 bg-amber-50 border border-amber-100 rounded-xl text-[11.5px] text-amber-950 leading-relaxed flex gap-2">
              <span class="shrink-0">ⓘ</span>
              <span>{{ 'whatsappWizard.infoShared' | translate }}</span>
            </div>
          </aside>
        </div>
      }

      <!-- Step 3 -->
      @if (step() === 3) {
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
          <div class="flex flex-col gap-4 min-w-0">
            <div class="inline-flex p-1 bg-slate-100 rounded-xl w-full max-w-md">
              @for (m of modes; track m.k) {
                <button type="button" (click)="setMode(m.k)"
                        class="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-left min-h-12 border-0 cursor-pointer transition-all"
                        [class]="mode() === m.k ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'">
                  <span>{{ m.icon }}</span>
                  <span class="text-[12px] font-semibold">{{ m.titleKey | translate }}</span>
                </button>
              }
            </div>

            @if (mode() === 'template') {
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div class="px-[18px] py-3 border-b border-slate-200">
                  <h3 class="font-display font-semibold text-[13px]">{{ 'whatsappWizard.step3ChooseTemplate' | translate }}</h3>
                  <p class="text-[11px] text-slate-500 mt-1">{{ 'whatsappWizard.varsAutoHint' | translate: { nome: hintNomeBolaoExemplo() } }}</p>
                </div>
                <div class="p-3 max-h-[min(40dvh,18rem)] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                  @for (t of templates(); track t.id) {
                    <button type="button" (click)="selectTemplate(t)"
                            class="p-3 rounded-[10px] text-left border-[1.5px] transition-all"
                            [class]="selectedId() === t.id ? 'border-green-600 bg-green-50' : 'border-slate-200 hover:border-slate-300'">
                      <div class="text-[13px] font-semibold truncate">{{ t.nome }}</div>
                      <div class="font-mono text-[10px] text-slate-400">{{ t.tipo }}</div>
                    </button>
                  }
                </div>
              </div>
            } @else {
              <div class="bg-white border border-slate-200 rounded-xl p-4">
                <label class="text-xs font-semibold text-slate-500">{{ 'whatsappEnvio.manualEditorTitle' | translate }}</label>
                <textarea [ngModel]="manualContent()" (ngModelChange)="manualContent.set($event)" name="wizManual" rows="12"
                          class="w-full mt-2 px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono min-h-[200px]"></textarea>
              </div>
            }

            <div class="flex flex-wrap gap-2">
              <button type="button" (click)="step.set(2)"
                      class="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-[10px] min-h-10">
                ← {{ 'whatsappWizard.backRefine' | translate }}
              </button>
            </div>
          </div>

          <aside class="flex flex-col gap-4 lg:sticky lg:top-24">
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div class="px-4 py-3 border-b border-slate-200">
                <h3 class="font-display font-semibold text-[12.5px]">{{ 'whatsappEnvio.previewTitle' | translate }}</h3>
                @if (mode() === 'template' && primeiroBolaoParaPreview()) {
                  <p class="text-[10.5px] text-slate-400 mt-1">{{ 'whatsappWizard.previewUsesPool' | translate: { nome: primeiroBolaoParaPreview()!.nome } }}</p>
                }
              </div>
              <div class="relative max-h-[min(42dvh,18rem)] overflow-y-auto p-3.5 bg-gradient-to-b from-[#ece5dd] to-[#d9d1c4]">
                <div class="absolute inset-0 opacity-60 pointer-events-none"
                     style="background-image: radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px); background-size: 10px 10px;"></div>
                <div class="relative max-w-[280px]">
                  <div class="bg-white rounded-[10px] rounded-bl-sm px-3 py-2.5 shadow text-[11.5px] whitespace-pre-wrap break-words text-neutral-900">
                    <div class="text-[10.5px] font-semibold text-green-700 mb-1">{{ 'whatsapp.brand' | translate }}</div>
                    {{ previewBody() || ('whatsappEnvio.previewEmpty' | translate) }}
                  </div>
                </div>
              </div>
              <div class="px-4 py-2 border-t text-[11px] text-slate-500 flex justify-between">
                <span><span class="font-mono">{{ previewBody().length }}</span> {{ 'whatsappEnvio.chars' | translate }}</span>
              </div>
            </div>
            @if (pageError()) {
              <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ pageError() }}</div>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class WhatsappEnvioEtapasComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly modes = [
    { k: 'template' as const, icon: '📄', titleKey: 'whatsappEnvio.modeTpl' },
    { k: 'manual' as const, icon: '✎', titleKey: 'whatsappEnvio.modeManual' },
  ];

  session = signal<SessionInfo | null>(null);
  boloesWa = signal<BolaoComWa[]>([]);
  loadingBoloes = signal(false);
  templates = signal<WaTemplateApi[]>([]);
  step = signal<WizardStep>(1);
  selectedBolaoIds = signal<string[]>([]);
  /** Por bolão: ids de grupos marcados para envio */
  gruposPorBolao = signal<Record<string, string[]>>({});

  mode = signal<'template' | 'manual'>('template');
  selectedId = signal<string | null>(null);
  manualContent = signal('');
  sending = signal(false);
  pageError = signal('');
  /** Preenchido ao entrar no passo 3 (último sorteio + valor bruto por bolão). */
  hintsPorBolao = signal<Record<string, BolaoWaTemplateHints>>({});

  selectedBoloesRows = computed(() => {
    const set = new Set(this.selectedBolaoIds());
    return this.boloesWa().filter(b => set.has(b.id));
  });

  rowsStep2 = computed(() => this.selectedBoloesRows());

  /** Primeiro bolão na ordem de seleção — usado para exemplo na pré-visualização do template. */
  primeiroBolaoParaPreview = computed((): BolaoComWa | undefined => {
    for (const id of this.selectedBolaoIds()) {
      const b = this.boloesWa().find(x => x.id === id);
      if (b) return b;
    }
    return undefined;
  });

  /** Nome do bolão de exemplo (ou rótulo traduzido) para textos de ajuda no passo 3. */
  hintNomeBolaoExemplo = computed((): string => {
    const b = this.primeiroBolaoParaPreview();
    return b?.nome ?? this.translate.instant('whatsappWizard.examplePoolName');
  });

  selected = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.templates().find(t => t.id === id) ?? null;
  });

  previewBody = computed(() => {
    if (this.mode() === 'manual') return this.manualContent().trim();
    return this.buildMessageForBolao(this.primeiroBolaoParaPreview());
  });

  totalGruposSel = computed(() => {
    const g = this.gruposPorBolao();
    return Object.values(g).reduce((s, arr) => s + arr.length, 0);
  });

  cotasSomadas = computed(() =>
    this.selectedBoloesRows().reduce((s, b) => s + b.totalCotasAtivas, 0),
  );

  totalEnvios = computed(() => {
    let n = 0;
    const map = this.gruposPorBolao();
    for (const ids of Object.values(map)) n += ids.length;
    return n;
  });

  resumoStep2 = computed(() =>
    this.translate.instant('whatsappWizard.badgeGroupsReach', {
      g: this.totalGruposSel(),
      c: this.cotasSomadas(),
    }),
  );

  stepperItems = computed(() => {
    const cur = this.step();
    const mk = (n: WizardStep, labKey: string, descKey: string) => {
      let state: 'done' | 'current' | 'todo';
      if (cur > n) state = 'done';
      else if (cur === n) state = 'current';
      else state = 'todo';
      return { n, labKey, descKey, state };
    };
    return [
      mk(1, 'whatsappWizard.stepLabel1', 'whatsappWizard.stepDesc1'),
      mk(2, 'whatsappWizard.stepLabel2', 'whatsappWizard.stepDesc2'),
      mk(3, 'whatsappWizard.stepLabel3', 'whatsappWizard.stepDesc3'),
    ];
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  stepCircleClass(state: 'done' | 'current' | 'todo'): string {
    if (state === 'current') return 'bg-green-700 text-white border-green-600 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]';
    if (state === 'done') return 'bg-green-100 text-green-800 border-green-200';
    return 'bg-slate-100 text-slate-400 border-slate-200';
  }

  private async bootstrap(): Promise<void> {
    await Promise.all([this.loadSession(), this.loadBoloesComWa(), this.loadTemplates()]);
    const list = this.templates();
    if (list.length > 0 && !this.selectedId()) this.selectTemplate(list[0]);
  }

  private async loadSession(): Promise<void> {
    try {
      this.session.set(await firstValueFrom(this.api.get<SessionInfo>('/whatsapp/sessao/status')));
    } catch {
      this.session.set({ status: 'DESCONECTADO' });
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

  private async loadTemplates(): Promise<void> {
    try {
      const ts = await firstValueFrom(this.api.get<WaTemplateApi[]>('/whatsapp/templates'));
      this.templates.set(ts.filter(t => t.ativo));
    } catch {
      this.templates.set([]);
    }
  }

  isBolaoSel(id: string): boolean {
    return this.selectedBolaoIds().includes(id);
  }

  toggleBolao(id: string): void {
    this.selectedBolaoIds.update(arr =>
      arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id],
    );
  }

  goStep2(): void {
    const rows = this.boloesWa().filter(b =>
      this.selectedBolaoIds().includes(b.id) && b.grupos.length > 0,
    );
    const next: Record<string, string[]> = {};
    for (const b of rows) {
      next[b.id] = b.grupos.map(g => g.id);
    }
    this.gruposPorBolao.set(next);
    this.step.set(2);
  }

  goStep3(): void {
    if (this.totalEnvios() === 0) return;
    this.step.set(3);
    void this.prefetchTemplateHintsBoloes();
  }

  /** Carrega último sorteio e arrecadação bruta por bolão selecionado (variáveis {{dataSorteio}}, etc.). */
  private async prefetchTemplateHintsBoloes(): Promise<void> {
    const ids = this.selectedBolaoIds();
    const next = { ...this.hintsPorBolao() };
    await Promise.all(
      ids.map(async id => {
        try {
          const d = await firstValueFrom(this.api.get<DashboardEnvioSlice>(`/boloes/${id}/dashboard`));
          const lista = d.sorteios ?? [];
          const ultimo = lista.length > 0 ? lista[lista.length - 1] : null;
          const vb = d.valorBruto;
          next[id] = {
            ultimoSorteio: ultimo,
            valorBruto: typeof vb === 'number' && Number.isFinite(vb) ? vb : null,
          };
        } catch {
          next[id] = { ultimoSorteio: null, valorBruto: null };
        }
      }),
    );
    this.hintsPorBolao.set(next);
  }

  isGrupoSel(bolaoId: string, grupoId: string): boolean {
    return (this.gruposPorBolao()[bolaoId] ?? []).includes(grupoId);
  }

  toggleGrupoBolao(bolaoId: string, grupoId: string): void {
    this.gruposPorBolao.update(m => {
      const cur = [...(m[bolaoId] ?? [])];
      const i = cur.indexOf(grupoId);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(grupoId);
      return { ...m, [bolaoId]: cur };
    });
  }

  toggleAllGruposBolao(bolaoId: string, selectAll: boolean): void {
    const b = this.boloesWa().find(x => x.id === bolaoId);
    if (!b) return;
    this.gruposPorBolao.update(m => ({
      ...m,
      [bolaoId]: selectAll ? b.grupos.map(g => g.id) : [],
    }));
  }

  setMode(m: 'template' | 'manual'): void {
    this.mode.set(m);
  }

  selectTemplate(t: WaTemplateApi): void {
    this.selectedId.set(t.id);
  }

  /** Substitui `{{…}}` no conteúdo do template com valores de exemplo para o bolão indicado. */
  buildMessageForBolao(bolao: BolaoComWa | undefined): string {
    if (this.mode() === 'manual') return this.manualContent().trim();
    const t = this.selected();
    if (!t) return '';
    const keys = extractTemplateKeys(t.conteudo);
    const hints = bolao ? this.hintsPorBolao()[bolao.id] : undefined;
    const vars = this.exampleValuesForKeys(keys, bolao, hints);
    return this.applyVarSubstitutions(t.conteudo, vars);
  }

  private applyVarSubstitutions(conteudo: string, vars: Record<string, string>): string {
    let s = conteudo;
    for (const k of Object.keys(vars)) {
      const re = new RegExp(`\\{\\{\\s*${escapeRe(k)}\\s*\\}\\}`, 'g');
      s = s.replace(re, vars[k] ?? '');
    }
    return s.trim();
  }

  /** Valores para pré-visualização e envio: dados reais quando `hints` tem dashboard; senão exemplos/i18n. */
  private exampleValuesForKeys(
    keys: string[],
    bolao: BolaoComWa | undefined,
    hints: BolaoWaTemplateHints | undefined,
  ): Record<string, string> {
    const nomePool = bolao?.nome ?? this.translate.instant('whatsappWizard.examplePoolName');
    const cotasNum = bolao?.totalCotasAtivas ?? 9244;
    const cotasStr = new Intl.NumberFormat('pt-BR').format(cotasNum);
    const draw = hints?.ultimoSorteio ?? null;
    const valorBruto = hints?.valorBruto;

    const dataDraw = (): string =>
      draw != null ? fmtDataSorteioPt(draw.dataSorteio) : this.translate.instant('whatsappWizard.exampleDrawDate');
    const numConcurso = (): string =>
      draw != null ? String(draw.numeroConcurso) : this.translate.instant('whatsappWizard.exampleConcursoNum');
    const linhaBolas = (): string =>
      draw != null && draw.bolasSorteadas.length > 0
        ? fmtBolasSorteio(draw.bolasSorteadas)
        : '04, 11, 23, 31, 42, 55';
    const linhaArrecadacao = (): string =>
      valorBruto != null ? formatBrlPt(valorBruto) : this.translate.instant('whatsappWizard.exampleArrecadacao');

    const common = (raw: string): string | undefined => {
      const k = raw.toLowerCase().trim();

      if (k === 'nomebolao' || k === 'nome_bolao') return nomePool;
      if (k.includes('nome') && k.includes('bolao') && !k.includes('ganhador')) return nomePool;
      if (k === 'bolao_nome' || k === 'bolao') return nomePool;

      if (k === 'totalcotas' || k === 'total_cotas') return cotasStr;

      if (k === 'numeroconcurso' || k === 'numero_concurso') return numConcurso();
      if (k === 'datasorteio' || k === 'data_sorteio' || k.includes('datasorte')) return dataDraw();
      if (k.includes('data') && k.includes('sorte')) return dataDraw();

      if (k === 'bolas' || k === 'bolassorteadas' || k === 'bolas_sorteadas') return linhaBolas();

      if (k.includes('arrecad') || k === 'valorbruto' || k === 'valor_bruto') return linhaArrecadacao();

      if ((k.includes('bola') || k.includes('numeros')) && !k.includes('bolao')) return linhaBolas();

      if (k.includes('concurso')) return numConcurso();

      if (k.includes('tenant')) return this.translate.instant('whatsappWizard.exampleTenant');
      if (k.includes('admin')) return this.translate.instant('whatsappWizard.exampleAdmin');

      if (k.includes('tabela') || k.includes('ranking')) return this.translate.instant('whatsappWizard.exampleRankingLine');
      if (k.includes('lista') || k.includes('premio') || k.includes('ganhador')) {
        return this.translate.instant('whatsappWizard.exampleWinnersLine');
      }

      if (k.includes('cota')) return cotasStr;

      return undefined;
    };

    const out: Record<string, string> = {};
    for (const key of keys) {
      out[key] = common(key) ?? `(${key})`;
    }
    return out;
  }

  msgTipoAtual(): MsgTipo {
    if (this.mode() === 'manual') return 'MANUAL';
    const t = this.selected();
    return t && isMsgTipo(t.tipo) ? t.tipo : 'MANUAL';
  }

  podeEnviar(): boolean {
    if (this.session()?.status !== 'CONECTADO') return false;
    if (this.totalEnvios() === 0) return false;
    const body = this.mode() === 'manual'
      ? this.manualContent().trim()
      : this.buildMessageForBolao(this.primeiroBolaoParaPreview());
    if (!body || body.length > 4096) return false;
    if (this.mode() === 'template' && !this.selected()) return false;
    return true;
  }

  private flattenEnvios(): { grupoId: string; bolaoId: string }[] {
    const out: { grupoId: string; bolaoId: string }[] = [];
    const map = this.gruposPorBolao();
    for (const [bolaoId, ids] of Object.entries(map)) {
      for (const grupoId of ids) {
        out.push({ grupoId, bolaoId });
      }
    }
    return out;
  }

  async enviar(): Promise<void> {
    if (!this.podeEnviar() || this.sending()) return;
    this.sending.set(true);
    this.pageError.set('');
    const tipo = this.msgTipoAtual();
    const manual = this.mode() === 'manual';
    try {
      for (const d of this.flattenEnvios()) {
        const bolao = this.boloesWa().find(b => b.id === d.bolaoId);
        const conteudo = manual ? this.manualContent().trim() : this.buildMessageForBolao(bolao);
        await firstValueFrom(
          this.api.post('/whatsapp/mensagens', {
            grupoId: d.grupoId,
            tipo,
            conteudo,
            bolaoId: d.bolaoId,
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
