import {
  Component, ChangeDetectionStrategy, OnInit, computed, inject, signal,
  ElementRef, ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';

interface Template {
  id: string;
  nome: string;
  conteudo: string;
  tipo: string;
  ativo: boolean;
  criadoEm: string;
}

interface VarItem {
  tag: string;
  descKey: string;
}

interface VarGroup {
  groupKey: string;
  items: VarItem[];
}

const TIPOS: { value: string; labelKey: string }[] = [
  { value: 'MANUAL', labelKey: 'whatsapp.optManual' },
  { value: 'RESULTADO_SORTEIO', labelKey: 'whatsapp.optResultadoSorteio' },
  { value: 'RANKING_PARCIAL', labelKey: 'whatsapp.optRankingParcial' },
  { value: 'PREMIADOS', labelKey: 'whatsapp.optPremiados' },
  { value: 'AVISO_ADMIN', labelKey: 'whatsapp.optAvisoAdmin' },
];

const VAR_GROUPS: VarGroup[] = [
  {
    groupKey: 'waTpl.grSorteio',
    items: [
      { tag: '{{numeroConcurso}}', descKey: 'waTpl.vNumeroConcurso' },
      { tag: '{{dataSorteio}}', descKey: 'waTpl.vDataSorteio' },
      { tag: '{{bolas}}', descKey: 'waTpl.vBolas' },
    ],
  },
  {
    groupKey: 'waTpl.grBolao',
    items: [
      { tag: '{{nomeBolao}}', descKey: 'waTpl.vNomeBolao' },
      { tag: '{{totalCotas}}', descKey: 'waTpl.vTotalCotas' },
      { tag: '{{arrecadacao}}', descKey: 'waTpl.vArrecadacao' },
    ],
  },
  {
    groupKey: 'waTpl.grPremios',
    items: [
      { tag: '{{nomeGanhador}}', descKey: 'waTpl.vNomeGanhador' },
      { tag: '{{premio}}', descKey: 'waTpl.vPremio' },
    ],
  },
];

const SAMPLE_VALUES: Record<string, string> = {
  nomeBolao: 'Bolão Mega 2989',
  numeroConcurso: '2994',
  dataSorteio: '28/04/2026',
  bolas: '04 · 07 · 12 · 23 · 28 · 31',
  totalCotas: '9.244',
  arrecadacao: 'R$ 277.320,00',
  nomeGanhador: 'ADERSON AMORIM',
  premio: 'R$ 152.526,00',
};

function innerKeyFromTag(tag: string): string {
  return tag.replace(/\{\{\s*|\s*\}\}/g, '').trim();
}

function extractUsedKeys(conteudo: string): Set<string> {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(conteudo)) !== null) set.add(m[1].trim());
  return set;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Component({
  selector: 'nb-wa-templates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, BackButtonComponent, TranslatePipe, ConfirmModalComponent],
  templateUrl: './wa-templates.component.html',
})
export class WaTemplatesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  @ViewChild('conteudoTa') private conteudoTa?: ElementRef<HTMLTextAreaElement>;

  templates = signal<Template[]>([]);
  /** Lista superior: só tipo MANUAL (inclui rascunho “Novo” na UI). */
  templatesManuais = computed(() => this.templates().filter(t => t.tipo === 'MANUAL'));
  /** Lista inferior: RESULTADO_SORTEIO, RANKING_PARCIAL, PREMIADOS, AVISO_ADMIN, etc. */
  templatesAutomaticos = computed(() => this.templates().filter(t => t.tipo !== 'MANUAL'));
  loading = signal(true);
  /** null = nenhum; string = id; fluxo novo usa creatingNew */
  selectedId = signal<string | null>(null);
  creatingNew = signal(false);
  gruposCount = signal(0);

  fNome = signal('');
  fConteudo = signal('');
  fTipo = signal('MANUAL');
  fAtivo = signal(true);
  salvando = signal(false);
  editorError = signal('');
  copiado          = signal(false);
  confirmOpen      = signal(false);
  confirmDeleteId  = signal<string | null>(null);
  editorTab = signal<'edit' | 'md'>('edit');

  snapshot = signal({ nome: '', conteudo: '', tipo: 'MANUAL', ativo: true });

  readonly tiposOpt = TIPOS;
  readonly varGroups = VAR_GROUPS;
  readonly placeholderConteudo =
    '🏆 *{{nomeBolao}}*\n\nSorteio {{numeroConcurso}} realizado!\nBolas: {{bolas}}';

  /** Exemplo de anexo no protótipo (texto literal para o template). */
  readonly rankingMediaExample = 'ranking-{{numeroConcurso}}.png';

  readonly toolbarBtns: { k: string; lab: string }[] = [
    { k: 'b', lab: 'B' },
    { k: 'i', lab: 'I' },
    { k: 's', lab: 'S' },
    { k: 'div', lab: '' },
    { k: 'code', lab: '</>' },
    { k: 'div', lab: '' },
    { k: '•', lab: '•' },
  ];

  isDirty = computed(() => {
    const s = this.snapshot();
    return (
      this.fNome() !== s.nome ||
      this.fConteudo() !== s.conteudo ||
      this.fTipo() !== s.tipo ||
      this.fAtivo() !== s.ativo
    );
  });

  usedKeys = computed(() => extractUsedKeys(this.fConteudo()));

  usedVarCount = computed(() => {
    const used = this.usedKeys();
    let n = 0;
    for (const g of VAR_GROUPS) {
      for (const it of g.items) {
        if (used.has(innerKeyFromTag(it.tag))) n++;
      }
    }
    return n;
  });

  totalVarCount = computed(() => VAR_GROUPS.reduce((a, g) => a + g.items.length, 0));

  previewBody = computed(() => {
    let s = this.fConteudo();
    const used = this.usedKeys();
    for (const key of used) {
      const val = SAMPLE_VALUES[key] ?? `{{${key}}}`;
      const re = new RegExp(`\\{\\{\\s*${escapeRe(key)}\\s*\\}\\}`, 'g');
      s = s.replace(re, val);
    }
    return s.trim() || this.translate.instant('waTpl.previewEmpty');
  });

  previewBolas = computed(() => {
    const used = this.usedKeys();
    if (!used.has('bolas')) return [] as string[];
    const raw = SAMPLE_VALUES['bolas'] ?? '';
    return raw.split(/[^0-9]+/).filter(x => x.length > 0).map(x => x.padStart(2, '0')).slice(0, 6);
  });

  podeSalvar = computed(() => this.fNome().trim().length > 0 && this.fConteudo().trim().length > 0 && this.temSelecao());

  temSelecao = computed(() => this.creatingNew() || this.selectedId() !== null);

  breadcrumbLast = computed(() => {
    const n = this.fNome().trim();
    if (n) return n;
    return this.translate.instant('waTpl.breadcrumbTemplates');
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await Promise.all([this.load(), this.loadGruposCount()]);
  }

  private async loadGruposCount(): Promise<void> {
    try {
      const g = await firstValueFrom(this.api.get<{ id: string }[]>('/whatsapp/sessao/grupos'));
      this.gruposCount.set(Array.isArray(g) ? g.length : 0);
    } catch {
      this.gruposCount.set(0);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const ts = await firstValueFrom(this.api.get<Template[]>('/whatsapp/templates'));
      this.templates.set(ts);
      this.syncAfterLoad();
    } catch {
      this.templates.set([]);
      this.syncAfterLoad();
    } finally {
      this.loading.set(false);
    }
  }

  /** Mantém seleção por id após recarregar lista; senão primeiro item ou novo vazio. */
  private syncAfterLoad(): void {
    if (this.creatingNew()) return;
    const id = this.selectedId();
    const ts = this.templates();
    if (id) {
      const t = ts.find(x => x.id === id);
      if (t) {
        this.fNome.set(t.nome);
        this.fConteudo.set(t.conteudo);
        this.fTipo.set(t.tipo);
        this.fAtivo.set(t.ativo);
        this.captureSnapshot();
        return;
      }
    }
    if (ts.length > 0) {
      const primeiro = ts.find(x => x.tipo === 'MANUAL') ?? ts[0];
      this.selecionar(primeiro);
    } else {
      this.abrirNovo();
    }
  }

  isListaAtiva(id: string): boolean {
    return !this.creatingNew() && this.selectedId() === id;
  }

  tipoEhAuto(tipo: string): boolean {
    return tipo !== 'MANUAL';
  }

  isAutoTipo(): boolean {
    return this.tipoEhAuto(this.fTipo());
  }

  tipoTriggerHint(): string {
    return this.translate.instant(this.isAutoTipo() ? 'waTpl.hintTipoAuto' : 'waTpl.hintTipoManual');
  }

  tipoSubtitle(): string {
    const k =
      this.fTipo() === 'MANUAL'
        ? 'waTpl.subManual'
        : this.fTipo() === 'RESULTADO_SORTEIO'
          ? 'waTpl.subResultado'
          : this.fTipo() === 'RANKING_PARCIAL'
            ? 'waTpl.subRanking'
            : this.fTipo() === 'PREMIADOS'
              ? 'waTpl.subPremiados'
              : 'waTpl.subAviso';
    return this.translate.instant(k);
  }

  metaDisparoValor(): string {
    if (this.fTipo() === 'MANUAL') return this.translate.instant('waTpl.metaDisparoManual');
    return this.translate.instant('waTpl.metaDisparoAuto');
  }

  metaDisparoHint(): string {
    if (this.fTipo() === 'MANUAL') return this.translate.instant('waTpl.metaDisparoManualHint');
    return this.translate.instant('waTpl.metaDisparoAutoHint');
  }

  chipInner(tag: string): string {
    return innerKeyFromTag(tag);
  }

  varUsada(tag: string): boolean {
    return this.usedKeys().has(innerKeyFromTag(tag));
  }

  captureSnapshot(): void {
    this.snapshot.set({
      nome: this.fNome(),
      conteudo: this.fConteudo(),
      tipo: this.fTipo(),
      ativo: this.fAtivo(),
    });
  }

  applySnapshot(): void {
    const s = this.snapshot();
    this.fNome.set(s.nome);
    this.fConteudo.set(s.conteudo);
    this.fTipo.set(s.tipo);
    this.fAtivo.set(s.ativo);
  }

  selecionar(t: Template): void {
    this.creatingNew.set(false);
    this.selectedId.set(t.id);
    this.fNome.set(t.nome);
    this.fConteudo.set(t.conteudo);
    this.fTipo.set(t.tipo);
    this.fAtivo.set(t.ativo);
    this.editorError.set('');
    this.captureSnapshot();
  }

  abrirNovo(): void {
    this.creatingNew.set(true);
    this.selectedId.set(null);
    this.fNome.set('');
    this.fConteudo.set('');
    this.fTipo.set('MANUAL');
    this.fAtivo.set(true);
    this.editorError.set('');
    this.captureSnapshot();
  }

  discard(): void {
    if (!this.temSelecao()) return;
    this.applySnapshot();
    this.editorError.set('');
  }

  async salvar(): Promise<void> {
    if (!this.podeSalvar() || this.salvando()) return;
    this.salvando.set(true);
    this.editorError.set('');
    try {
      const id = this.selectedId();
      const base = { nome: this.fNome().trim(), conteudo: this.fConteudo().trim(), tipo: this.fTipo() };
      if (id) {
        await firstValueFrom(this.api.patch(`/whatsapp/templates/${id}`, { ...base, ativo: this.fAtivo() }));
      } else {
        const created = await firstValueFrom(this.api.post<Template>('/whatsapp/templates', base));
        this.creatingNew.set(false);
        this.selectedId.set(created.id);
      }
      await this.load();
    } catch (err: unknown) {
      this.editorError.set(
        (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('waTpl.saveError'),
      );
    } finally {
      this.salvando.set(false);
    }
  }

  pedirConfirmacaoExcluir(id: string): void {
    this.confirmDeleteId.set(id);
    this.confirmOpen.set(true);
  }

  cancelarExcluir(): void {
    this.confirmOpen.set(false);
    this.confirmDeleteId.set(null);
  }

  async excluir(): Promise<void> {
    const id = this.confirmDeleteId();
    this.confirmOpen.set(false);
    this.confirmDeleteId.set(null);
    if (!id) return;
    try {
      await firstValueFrom(this.api.delete(`/whatsapp/templates/${id}`));
      const wasSelected = this.selectedId() === id;
      this.templates.update(ts => ts.filter(t => t.id !== id));
      if (wasSelected) {
        this.selectedId.set(null);
        this.creatingNew.set(false);
        const rest = this.templates();
        if (rest.length > 0) {
          const next = rest.find(x => x.tipo === 'MANUAL') ?? rest[0];
          this.selecionar(next);
        } else {
          this.abrirNovo();
        }
      }
    } catch { /* silencioso */ }
  }

  inserirVariavel(tag: string): void {
    const ta = this.conteudoTa?.nativeElement;
    const ins = tag;
    if (!ta) {
      this.fConteudo.update(c => (c ? `${c}${ins}` : ins));
    } else {
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      const v = this.fConteudo();
      const next = v.slice(0, start) + ins + v.slice(end);
      this.fConteudo.set(next);
      queueMicrotask(() => {
        ta.focus();
        const pos = start + ins.length;
        ta.setSelectionRange(pos, pos);
      });
    }
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 1600);
  }

  toolbarAccao(k: string): void {
    const ta = this.conteudoTa?.nativeElement;
    if (!ta) return;
    const v = this.fConteudo();
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const sel = v.slice(start, end);
    let wrap: [string, string] = ['', ''];
    if (k === 'b') wrap = ['**', '**'];
    else if (k === 'i') wrap = ['_', '_'];
    else if (k === 's') wrap = ['~', '~'];
    else if (k === 'code') wrap = ['`', '`'];
    else if (k === '•') {
      const line = '\n• ';
      const next = v.slice(0, start) + line + v.slice(end);
      this.fConteudo.set(next);
      queueMicrotask(() => {
        ta.focus();
        const pos = start + line.length;
        ta.setSelectionRange(pos, pos);
      });
      return;
    }
    if (!wrap[0]) return;
    const inner = sel || 'texto';
    const next = v.slice(0, start) + wrap[0] + inner + wrap[1] + v.slice(end);
    this.fConteudo.set(next);
    queueMicrotask(() => {
      ta.focus();
      const pos = start + wrap[0].length + inner.length + wrap[1].length;
      ta.setSelectionRange(pos, pos);
    });
  }
}
