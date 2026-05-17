import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PhoneMaskDirective, PhonePipe } from '../../shared/phone';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BolaoRef { id: string; nome: string; cotasCount: number; }

interface Participante {
  id: string;
  nome: string;
  numeroCelular: string;
  email: string | null;
  observacoes: string | null;
  totalCotas: number;
  boloes: BolaoRef[];
  criadoEm: string;
}

interface Paginated<T> { data: T[]; total: number; page: number; perPage: number; totalPages: number; }

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-participantes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, PhoneMaskDirective, PhonePipe, TranslatePipe],
  templateUrl: './participantes.component.html',
})
export class ParticipantesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  // ── List state ───────────────────────────────────────────────────────────────
  participantes = signal<Participante[]>([]);
  loading       = signal(false);
  error         = signal('');
  total         = signal(0);
  totalPages    = signal(0);
  page          = signal(1);
  busca         = signal('');

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Modal state ───────────────────────────────────────────────────────────────
  showModal    = signal(false);
  editando     = signal<Participante | null>(null);
  excluindo    = signal<Participante | null>(null);
  modalLoading = signal(false);
  modalError   = signal('');

  fNome        = signal('');
  fCelular     = signal('');
  fEmail       = signal('');
  fObservacoes = signal('');

  readonly podeEditarCelular = computed(() => this.auth.isMaster() || this.auth.isAdmin());

  podeSubmit = computed(() => {
    const nomeOk = this.fNome().trim().length >= 2;
    const editando = this.editando();
    let celularOk: boolean;
    if (!editando) {
      celularOk = /^\d{10,11}$/.test(this.fCelular().replace(/\D/g, ''));
    } else if (this.podeEditarCelular()) {
      celularOk = /^\d{10,11}$/.test(this.fCelular().replace(/\D/g, ''));
    } else {
      celularOk = true;
    }
    return nomeOk && celularOk;
  });

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const params = new URLSearchParams({
        page: String(this.page()),
        perPage: '50',
        ...(this.busca() && { busca: this.busca() }),
      });
      const res = await firstValueFrom(
        this.api.get<Paginated<Participante>>(`/participantes?${params}`),
      );
      this.participantes.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.totalPages);
    } catch {
      this.error.set(this.translate.instant('errors.loadParticipants'));
    } finally {
      this.loading.set(false);
    }
  }

  onBuscaChange(value: string): void {
    this.busca.set(value);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => { this.page.set(1); this.load(); }, 400);
  }

  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); } }

  // ── Modal ─────────────────────────────────────────────────────────────────────
  abrirModalCriar(): void {
    this.editando.set(null);
    this.fNome.set('');
    this.fCelular.set('');
    this.fEmail.set('');
    this.fObservacoes.set('');
    this.modalError.set('');
    this.showModal.set(true);
  }

  abrirModalEditar(p: Participante): void {
    this.editando.set(p);
    this.fNome.set(p.nome);
    this.fCelular.set(p.numeroCelular);
    this.fEmail.set(p.email ?? '');
    this.fObservacoes.set(p.observacoes ?? '');
    this.modalError.set('');
    this.showModal.set(true);
  }

  fecharModal(): void {
    this.showModal.set(false);
    this.editando.set(null);
    this.modalError.set('');
  }

  async salvar(): Promise<void> {
    if (!this.podeSubmit() || this.modalLoading()) return;
    this.modalLoading.set(true);
    this.modalError.set('');
    try {
      const p = this.editando();
      if (p) {
        await firstValueFrom(
          this.api.patch(`/participantes/${p.id}`, {
            nome:        this.fNome().trim().toUpperCase(),
            email:       this.fEmail().trim() || undefined,
            observacoes: this.fObservacoes().trim() || undefined,
            ...(this.podeEditarCelular() && { numeroCelular: this.fCelular().replace(/\D/g, '') }),
          }),
        );
      } else {
        await firstValueFrom(
          this.api.post('/participantes', {
            nome:          this.fNome().trim().toUpperCase(),
            numeroCelular: this.fCelular().replace(/\D/g, ''),
            email:         this.fEmail().trim() || undefined,
            observacoes:   this.fObservacoes().trim() || undefined,
          }),
        );
      }
      this.fecharModal();
      await this.load();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('errors.saveGeneric');
      this.modalError.set(msg);
    } finally {
      this.modalLoading.set(false);
    }
  }

  confirmarExcluir(p: Participante): void {
    this.excluindo.set(p);
    this.modalError.set('');
  }

  async excluir(): Promise<void> {
    const p = this.excluindo();
    if (!p) return;
    this.modalLoading.set(true);
    try {
      await firstValueFrom(this.api.delete(`/participantes/${p.id}`));
      this.excluindo.set(null);
      await this.load();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('errors.deleteParticipant');
      this.error.set(msg);
      this.excluindo.set(null);
    } finally {
      this.modalLoading.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  initials(nome: string): string {
    return nome.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }
}
