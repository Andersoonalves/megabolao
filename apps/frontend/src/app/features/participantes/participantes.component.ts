import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
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
  imports: [BackButtonComponent, FormsModule, RouterLink, PhoneMaskDirective, PhonePipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Dashboard</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Participantes</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Participantes</span>
      <button (click)="abrirModalCriar()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9">
        + Novo participante
      </button>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">Banco de participantes</h1>
        <p class="text-slate-500 text-[13.5px]">{{ total() }} participantes cadastrados neste tenant</p>
      </div>

      <!-- Main card -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">

        <!-- Filtros -->
        <div class="px-5 py-3.5 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div class="relative flex-1 min-w-[220px]">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input [ngModel]="busca()" (ngModelChange)="onBuscaChange($event)"
                   class="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700"
                   placeholder="Buscar por nome, celular ou e-mail" />
          </div>
        </div>

        @if (error()) {
          <div class="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">⚠ {{ error() }}</div>
        }

        <!-- Tabela desktop -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-2.5">Participante</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Celular</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">E-mail</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Bolões</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Cotas</th>
                <th class="px-4 py-2.5 w-28"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4,5]; track i) {
                  <tr class="border-b border-slate-100">
                    <td colspan="6" class="px-5 py-3">
                      <div class="h-4 bg-slate-100 rounded animate-pulse w-3/4"></div>
                    </td>
                  </tr>
                }
              } @else if (participantes().length === 0) {
                <tr>
                  <td colspan="6" class="px-5 py-12 text-center text-slate-400 text-sm">
                    @if (busca()) { Nenhum resultado para "{{ busca() }}". }
                    @else { Nenhum participante cadastrado. Clique em "+ Novo participante" para começar. }
                  </td>
                </tr>
              } @else {
                @for (p of participantes(); track p.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                          {{ initials(p.nome) }}
                        </div>
                        <div>
                          <div class="font-semibold">{{ p.nome }}</div>
                          @if (p.observacoes) {
                            <div class="text-[11px] text-slate-400 truncate max-w-[200px]">{{ p.observacoes }}</div>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 font-mono text-[12.5px]">{{ p.numeroCelular | phone }}</td>
                    <td class="px-4 py-3 text-slate-500 text-[12.5px]">{{ p.email ?? '—' }}</td>
                    <td class="px-4 py-3">
                      <div class="flex flex-wrap gap-1">
                        @for (b of p.boloes.slice(0,3); track b.id) {
                          <span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-semibold truncate max-w-[100px]">{{ b.nome }}</span>
                        }
                        @if (p.boloes.length > 3) {
                          <span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-semibold">+{{ p.boloes.length - 3 }}</span>
                        }
                        @if (p.boloes.length === 0) {
                          <span class="text-slate-400 text-xs">—</span>
                        }
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span class="font-mono font-semibold text-[13px]">{{ p.totalCotas }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-1">
                        <button (click)="abrirModalEditar(p)"
                                class="px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                          Editar
                        </button>
                        <button (click)="confirmarExcluir(p)"
                                class="px-2.5 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100">
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Cards mobile -->
        <div class="sm:hidden divide-y divide-slate-100">
          @if (loading()) {
            @for (i of [1,2,3]; track i) {
              <div class="p-4"><div class="h-4 bg-slate-100 rounded animate-pulse w-3/4 mb-2"></div><div class="h-3 bg-slate-100 rounded animate-pulse w-1/2"></div></div>
            }
          } @else if (participantes().length === 0) {
            <div class="p-8 text-center text-slate-400 text-sm">Nenhum participante cadastrado.</div>
          } @else {
            @for (p of participantes(); track p.id) {
              <div class="p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-9 h-9 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                      {{ initials(p.nome) }}
                    </div>
                    <div class="min-w-0">
                      <div class="font-semibold text-[13.5px] truncate">{{ p.nome }}</div>
                      <div class="text-slate-400 text-[12px] font-mono">{{ p.numeroCelular | phone }}</div>
                      @if (p.email) { <div class="text-slate-400 text-[11px]">{{ p.email }}</div> }
                    </div>
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <button (click)="abrirModalEditar(p)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-sm transition-colors">✎</button>
                    <button (click)="confirmarExcluir(p)" class="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg text-sm transition-colors">🗑</button>
                  </div>
                </div>
                <div class="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{{ p.boloes.length }} bolão(ões)</span>
                  <span>·</span>
                  <span>{{ p.totalCotas }} cota(s)</span>
                </div>
              </div>
            }
          }
        </div>

        <!-- Paginação -->
        <div class="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-slate-400 text-xs">Mostrando {{ participantes().length }} de {{ total() }}</span>
          <div class="flex gap-1.5">
            <button (click)="prevPage()" [disabled]="page() <= 1 || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              Anterior
            </button>
            <span class="px-3 py-1.5 text-sm text-slate-500">{{ page() }} / {{ totalPages() }}</span>
            <button (click)="nextPage()" [disabled]="page() >= totalPages() || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal Criar / Editar ───────────────────────────────────────────────── -->
    @if (showModal()) {
      <div class="fixed inset-0 bg-black/40 z-40" (click)="fecharModal()"></div>
      <div class="fixed right-0 top-0 h-full w-full sm:w-[440px] bg-white shadow-xl z-50 flex flex-col overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 class="font-display font-semibold text-lg">
            {{ editando() ? 'Editar participante' : 'Novo participante' }}
          </h2>
          <button (click)="fecharModal()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">✕</button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          <!-- Nome -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome *</label>
            <input [ngModel]="fNome()" (ngModelChange)="fNome.set($event)"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 uppercase"
                   placeholder="NOME COMPLETO" />
          </div>

          <!-- Celular (só no criar) -->
          @if (!editando()) {
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Celular *</label>
              <input phoneMask [ngModel]="fCelular()" (ngModelChange)="fCelular.set($event)"
                     type="tel" inputmode="numeric"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                     placeholder="(83) 99999-9999" />
              <p class="text-[11px] text-slate-400 mt-1">10 ou 11 dígitos, somente números</p>
            </div>
          } @else {
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Celular</label>
              <div class="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[10px] text-sm font-mono text-slate-500">
                {{ fCelular() | phone }}
              </div>
              <p class="text-[11px] text-slate-400 mt-1">Celular não pode ser alterado</p>
            </div>
          }

          <!-- E-mail -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">E-mail</label>
            <input [ngModel]="fEmail()" (ngModelChange)="fEmail.set($event)"
                   type="email"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                   placeholder="participante@email.com" />
          </div>

          <!-- Observações -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Observações</label>
            <textarea [ngModel]="fObservacoes()" (ngModelChange)="fObservacoes.set($event)"
                      rows="3"
                      class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 resize-none"
                      placeholder="Cliente VIP, referência de fulano..."></textarea>
          </div>

          @if (modalError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ modalError() }}</div>
          }
        </div>

        <div class="px-6 py-4 border-t border-slate-200 flex gap-2.5 flex-shrink-0">
          <button (click)="fecharModal()" class="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-sm rounded-[10px] transition-colors">
            Cancelar
          </button>
          <button (click)="salvar()" [disabled]="!podeSubmit() || modalLoading()"
                  class="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm">
            {{ modalLoading() ? 'Salvando...' : editando() ? 'Salvar' : 'Cadastrar' }}
          </button>
        </div>
      </div>
    }

    <!-- ── Modal Confirmar Exclusão ───────────────────────────────────────────── -->
    @if (excluindo()) {
      <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
          <h3 class="font-display font-semibold text-lg mb-2">Excluir participante?</h3>
          <p class="text-slate-500 text-sm mb-1">
            <strong class="text-slate-700">{{ excluindo()!.nome }}</strong> será removido do banco de participantes.
          </p>
          <p class="text-slate-400 text-xs mb-5">Esta ação não pode ser desfeita. Cotas vinculadas permanecem no histórico.</p>
          <div class="flex gap-2.5">
            <button (click)="excluindo.set(null)" class="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-sm rounded-[10px] transition-colors">
              Cancelar
            </button>
            <button (click)="excluir()" [disabled]="modalLoading()"
                    class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-semibold text-sm rounded-[10px] transition-colors">
              {{ modalLoading() ? 'Excluindo...' : 'Excluir' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ParticipantesComponent implements OnInit {
  private readonly api = inject(ApiService);

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

  podeSubmit = computed(() => {
    const nomeOk    = this.fNome().trim().length >= 2;
    const celularOk = this.editando() !== null || /^\d{10,11}$/.test(this.fCelular().replace(/\D/g, ''));
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
      this.error.set('Erro ao carregar participantes.');
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
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao salvar.';
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
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao excluir.';
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
