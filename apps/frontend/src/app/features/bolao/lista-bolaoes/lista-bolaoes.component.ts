import {
  Component, signal, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

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
}

interface Paginated<T> { data: T[]; total: number; page: number; totalPages: number; }

@Component({
  selector: 'nb-lista-bolaoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, FormsModule, TranslatePipe],
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
  statusFiltro = signal('');
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  ngOnInit(): void { this.load(); }

  // ── Filtros ───────────────────────────────────────────────────────────────────
  onBuscaChange(v: string): void {
    this.busca.set(v);
    this.page.set(1);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.load(), 350);
  }

  onStatusChange(v: string): void {
    this.statusFiltro.set(v);
    this.page.set(1);
    this.load();
  }

  limparFiltros(): void {
    this.busca.set('');
    this.statusFiltro.set('');
    this.page.set(1);
    this.load();
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
      this.bolaoes.set(res.data);
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
      this.bolaoes.update(bs => bs.map(x => x.id === b.id ? updated : x));
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
    return b.status === 'A_SER_INICIADO' || b.status === 'SUSPENSO';
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
    if (s === 'FINALIZADO')     return 'bg-slate-100 text-slate-500 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      EM_ANDAMENTO:   'Em andamento',
      A_SER_INICIADO: 'A iniciar',
      FINALIZADO:     'Finalizado',
      SUSPENSO:       'Suspenso',
    };
    return m[s] ?? s;
  }

  fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return '—'; }
  }

  brl(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
}
