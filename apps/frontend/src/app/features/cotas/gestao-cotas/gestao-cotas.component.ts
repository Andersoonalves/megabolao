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
  templateUrl: './gestao-cotas.component.html',
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

