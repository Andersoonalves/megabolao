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
  templateUrl: './whatsapp-envio-mensagem.component.html',
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
