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
  templateUrl: './whatsapp-envio-etapas.component.html',
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
