import {
  ChangeDetectionStrategy, Component, computed, inject, OnInit, signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import {
  formatarProximoSorteioCompacto,
  resolverProximoSorteioMega,
} from '@nossobolao/shared-utils';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { BolasGridComponent } from '../../../shared/components/bolas-grid/bolas-grid.component';

interface CategoriaResumo {
  id: string;
  nome: string;
  tipo: string;
}

interface BolaoResponse {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
  dataInicio: string | null;
  dataTermino: string | null;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  criadoEm: string;
  categorias?: CategoriaResumo[];
  sorteiosRegistrados?: number;
  bolasJaSorteadas?: number[];
  maiorPontuacaoAtual?: number;
  maiorPontuacaoCotaNumero?: number | null;
  maiorPontuacaoCotaNome?: string | null;
}

interface Paginated<T> { data: T[]; total: number; page: number; totalPages: number; }

interface MegaPainelProximoResponse {
  proximo: { numero: number | null; data: string | null };
}

export type ListaBoloesVisualizacao = 'list' | 'table' | 'compact';

export type ListaBoloesOrdenacao = 'recent' | 'nome' | 'arrecada' | 'cotas' | 'status';

const VIEW_STORAGE_KEY = 'nb_lista_boloes_view';

/** Aba inicial da listagem (protótipo: foco em bolões ativos). */
const DEFAULT_STATUS_FILTRO = 'EM_ANDAMENTO';

@Component({
  selector: 'nb-lista-bolaoes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    BolasGridComponent,
    BackButtonComponent,
    RouterLink,
    FormsModule,
    TranslatePipe,
  ],
  templateUrl: './lista-bolaoes.component.html',
})
export class ListaBolaoesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  // ── List state ────────────────────────────────────────────────────────────────
  bolaoes      = signal<BolaoResponse[]>([]);
  loading      = signal(true);
  error        = signal('');
  total        = signal(0);
  totalPages   = signal(1);
  page         = signal(1);
  busca        = signal('');
  statusFiltro = signal(DEFAULT_STATUS_FILTRO);
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Lista | Tabela | Compacto — igual ao protótipo. */
  visualizacao = signal<ListaBoloesVisualizacao>('list');

  ordenacao = signal<ListaBoloesOrdenacao>('recent');

  boloesOrdenados = computed(() =>
    ListaBolaoesComponent.sortBoloes([...this.bolaoes()], this.ordenacao()),
  );

  private static isAtivo(s: string): boolean {
    return s === 'EM_ANDAMENTO' || s === 'PREMIADO';
  }

  /** KPIs só da página atual (API paginada). Inclui PREMIADO pois ainda está em execução. */
  kpiAtivosPagina = computed(() => this.bolaoes().filter((b) => ListaBolaoesComponent.isAtivo(b.status)).length);

  kpiCotasPagina = computed(() => this.bolaoes()
    .filter((b) => ListaBolaoesComponent.isAtivo(b.status))
    .reduce((s, b) => s + b.totalCotasAtivas, 0));

  kpiArrecPagina = computed(() => this.bolaoes()
    .filter((b) => ListaBolaoesComponent.isAtivo(b.status))
    .reduce((s, b) => s + b.valorBrutoArrecadado, 0));

  readonly statusTabs = [
    { status: '',              key: 'tabAll' },
    { status: 'EM_ANDAMENTO',  key: 'tabRunning' },
    { status: 'PREMIADO',      key: 'tabPremiado' },
    { status: 'A_SER_INICIADO', key: 'tabPending' },
    { status: 'FINALIZADO',    key: 'tabFinished' },
  ] as const;

  readonly viewOptions = [
    { mode: 'list' as const, icon: '☰', titleKey: 'viewListHint' },
    { mode: 'compact' as const, icon: '▦', titleKey: 'viewCompactHint' },
    { mode: 'table' as const, icon: '▤', titleKey: 'viewTableHint' },
  ];

  // ── Edit state ────────────────────────────────────────────────────────────────
  editando       = signal<BolaoResponse | null>(null);
  editNome       = signal('');
  editValorCota  = signal(0);
  editDataInicio = signal('');
  editDataTermino = signal('');
  editLoading    = signal(false);
  editError      = signal('');

  // ── Delete state ──────────────────────────────────────────────────────────────
  confirmandoExclusao = signal<BolaoResponse | null>(null);
  deletandoId         = signal('');
  deleteError         = signal('');

  /** Próximo concurso oficial (cache Mega-Sena do tenant). */
  megaProximo = signal<{ data: string | null; numero: number | null }>({ data: null, numero: null });

  ngOnInit(): void {
    try {
      const v = sessionStorage.getItem(VIEW_STORAGE_KEY) as ListaBoloesVisualizacao | null;
      if (v === 'list' || v === 'table' || v === 'compact') this.visualizacao.set(v);
    } catch {
      /* sessionStorage bloqueado */
    }
    this.load();
    void this.carregarMegaProximo();
  }

  private async carregarMegaProximo(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.api.get<MegaPainelProximoResponse>('/sorteios/mega-sena?painel=1&ultimos=1'),
      );
      this.megaProximo.set({
        data: res.proximo.data,
        numero: res.proximo.numero,
      });
    } catch {
      /* usa inferência ter/qui/sáb */
    }
  }

  definirVisualizacao(m: ListaBoloesVisualizacao): void {
    this.visualizacao.set(m);
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, m);
    } catch {
      /* ignora */
    }
  }

  private static readonly statusRank: Record<string, number> = {
    EM_ANDAMENTO: 0,
    PREMIADO: 1,
    A_SER_INICIADO: 2,
    FINALIZADO: 3,
  };

  private static sortBoloes(rows: BolaoResponse[], ord: ListaBoloesOrdenacao): BolaoResponse[] {
    switch (ord) {
      case 'nome':
        return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      case 'arrecada':
        return rows.sort((a, b) => b.valorBrutoArrecadado - a.valorBrutoArrecadado);
      case 'cotas':
        return rows.sort((a, b) => b.totalCotasAtivas - a.totalCotasAtivas);
      case 'status': {
        return rows.sort((a, b) => {
          const ra = ListaBolaoesComponent.statusRank[a.status] ?? 9;
          const rb = ListaBolaoesComponent.statusRank[b.status] ?? 9;
          if (ra !== rb) return ra - rb;
          return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
        });
      }
      case 'recent':
      default:
        return rows.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
    }
  }

  tabLabelKey(tabKey: (typeof ListaBolaoesComponent.prototype.statusTabs)[number]['key']): string {
    return `listaBoloes.${tabKey}`;
  }

  definirTabStatus(status: string): void {
    this.statusFiltro.set(status);
    this.page.set(1);
    this.load();
  }

  mudarOrdenacao(v: string): void {
    const allowed: ListaBoloesOrdenacao[] = ['recent', 'nome', 'arrecada', 'cotas', 'status'];
    if ((allowed as string[]).includes(v)) this.ordenacao.set(v as ListaBoloesOrdenacao);
  }

  // ── Filtros ───────────────────────────────────────────────────────────────────
  onBuscaChange(v: string): void {
    this.busca.set(v);
    this.page.set(1);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.load(), 350);
  }

  // ── Load ──────────────────────────────────────────────────────────────────────
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const params = new URLSearchParams({
      page:    String(this.page()),
      perPage: '12',
      ...(this.busca()        && { busca:  this.busca() }),
      ...(this.statusFiltro() && { status: this.statusFiltro() }),
    });
    try {
      const res = await firstValueFrom(
        this.api.get<Paginated<BolaoResponse>>(`/boloes?${params}`),
      );
      this.bolaoes.set(res.data.map((row) => ({
        ...row,
        sorteiosRegistrados: row.sorteiosRegistrados ?? 0,
        bolasJaSorteadas: row.bolasJaSorteadas ?? [],
        maiorPontuacaoAtual: row.maiorPontuacaoAtual ?? 0,
        maiorPontuacaoCotaNumero: row.maiorPontuacaoCotaNumero ?? null,
        maiorPontuacaoCotaNome: row.maiorPontuacaoCotaNome ?? null,
        categorias: row.categorias ?? [],
      })));
      this.total.set(res.total);
      this.totalPages.set(res.totalPages);
    } catch (err: unknown) {
      type E = { error?: { message?: string }; status?: number };
      const e = err as E;
      this.error.set(
        e.error?.message ?? `${this.translate.instant('errors.loadPools')}${e.status ? ` [${e.status}]` : ''}`,
      );
    } finally {
      this.loading.set(false);
    }
  }

  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); } }

  exportarCsv(): void {
    const linhas = this.boloesOrdenados();
    if (!linhas.length) return;
    const sep = ';';
    const h = ['Bolão', 'Status', 'Cotas pagas', 'Arrecadação', 'Valor cota', 'Sorteios', 'Categorias'].join(sep);
    const body = linhas.map((b) =>
      [
        b.nome,
        b.status,
        String(b.totalCotasAtivas),
        b.valorBrutoArrecadado.toFixed(2),
        String(b.valorCota),
        String(b.sorteiosRegistrados ?? 0),
        String(b.categorias?.length ?? 0),
      ].join(sep),
    ).join('\n');
    const blob = new Blob([`${h}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'boloes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  sorteiosReg(b: BolaoResponse): number {
    return b.sorteiosRegistrados ?? 0;
  }

  bolasSorteadas(b: BolaoResponse): number[] {
    return b.bolasJaSorteadas ?? [];
  }

  exibeProximoSorteio(b: BolaoResponse): boolean {
    return b.status === 'EM_ANDAMENTO' || b.status === 'A_SER_INICIADO' || b.status === 'SUSPENSO';
  }

  linhaProximoSorteio(b: BolaoResponse): string {
    const instante = resolverProximoSorteioMega({
      referencia: new Date(),
      dataOficialBr: this.megaProximo().data,
      naoAntesIso: b.dataInicio,
    });
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    return formatarProximoSorteioCompacto(instante, loc);
  }

  labelConcursoProximo(): string | null {
    const n = this.megaProximo().numero;
    if (n == null) return null;
    return this.translate.instant('listaBoloes.nextDrawContest', { n });
  }

  maiorPontuacao(b: BolaoResponse): number {
    return b.maiorPontuacaoAtual ?? 0;
  }

  maiorPontuacaoCotaLabel(b: BolaoResponse): string | null {
    if (this.maiorPontuacao(b) <= 0) return null;
    const n = b.maiorPontuacaoCotaNumero;
    const nome = b.maiorPontuacaoCotaNome?.trim();
    if (n != null && nome) {
      return this.translate.instant('listaBoloes.topScoreCota', { n, nome });
    }
    if (nome) return nome;
    return null;
  }

  numCategorias(b: BolaoResponse): number {
    return b.categorias?.length ?? 0;
  }

  // ── Edição ────────────────────────────────────────────────────────────────────
  abrirEdicao(b: BolaoResponse): void {
    this.editando.set(b);
    this.editNome.set(b.nome);
    this.editValorCota.set(b.valorCota);
    this.editDataInicio.set(b.dataInicio ?? '');
    this.editDataTermino.set(b.dataTermino ?? '');
    this.editError.set('');
  }

  fecharEdicao(): void { this.editando.set(null); }

  async salvarEdicao(): Promise<void> {
    const b = this.editando();
    if (!b || this.editLoading() || !this.editNome().trim()) return;
    this.editLoading.set(true);
    this.editError.set('');
    try {
      const updated = await firstValueFrom(
        this.api.patch<BolaoResponse>(`/boloes/${b.id}`, {
          nome:        this.editNome().trim(),
          valorCota:   this.editValorCota(),
          ...(this.editDataInicio()  && { dataInicio:  this.editDataInicio() }),
          ...(this.editDataTermino() && { dataTermino: this.editDataTermino() }),
        }),
      );
      const merged = { ...updated, sorteiosRegistrados: updated.sorteiosRegistrados ?? 0 };
      this.bolaoes.update(bs => bs.map(x => x.id === b.id ? merged : x));
      this.fecharEdicao();
    } catch (err: unknown) {
      type E = { error?: { message?: string }; status?: number };
      const e = err as E;
      this.editError.set(
        e.error?.message ?? `${this.translate.instant('errors.savePool')}${e.status ? ` [${e.status}]` : ''}`,
      );
    } finally {
      this.editLoading.set(false);
    }
  }

  // ── Exclusão ─────────────────────────────────────────────────────────────────
  podeDeletar(b: BolaoResponse): boolean {
    return b.status === 'A_SER_INICIADO';
  }

  abrirConfirmacaoExclusao(b: BolaoResponse): void {
    this.confirmandoExclusao.set(b);
    this.deleteError.set('');
  }

  fecharConfirmacaoExclusao(): void { this.confirmandoExclusao.set(null); }

  async confirmarExclusao(): Promise<void> {
    const b = this.confirmandoExclusao();
    if (!b || this.deletandoId()) return;
    this.deletandoId.set(b.id);
    this.deleteError.set('');
    try {
      await firstValueFrom(this.api.delete(`/boloes/${b.id}`));
      this.bolaoes.update(bs => bs.filter(x => x.id !== b.id));
      this.total.update(t => t - 1);
      this.fecharConfirmacaoExclusao();
    } catch (err: unknown) {
      type E = { error?: { message?: string }; status?: number };
      const e = err as E;
      this.deleteError.set(
        e.error?.message ?? this.translate.instant('listaBoloes.deleteError'),
      );
    } finally {
      this.deletandoId.set('');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  statusClass(s: string): string {
    if (s === 'EM_ANDAMENTO')   return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'A_SER_INICIADO') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'PREMIADO')       return 'bg-amber-50 text-amber-700 border-amber-300';
    if (s === 'FINALIZADO')     return 'bg-slate-100 text-slate-500 border-slate-200';
    return 'bg-slate-50 text-slate-400 border-slate-200';
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    try { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return '—'; }
  }

  brl(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }

  brlShort(n: number): string {
    if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (n >= 1_000) return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return this.brl(n);
  }
}
