import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CodigoPermissao, ModuloComPermissoes, Perfil } from '@nossobolao/shared-types';
import { AuthService } from '../../../core/services/auth.service';
import { PerfilService } from '../../../core/services/perfil.service';
import { PermissaoService } from '../../../core/services/permissao.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { SePermissaoDirective } from '../../../shared/directives/se-permissao.directive';

@Component({
  selector: 'nb-perfis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, BackButtonComponent, SePermissaoDirective],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Sistema</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Perfis &amp; Permissões</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Perfis</span>
      <button *nbSe="'perfil.criar'" (click)="abrirModalCriar()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9">
        + Novo perfil
      </button>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">Perfis &amp; Permissões</h1>
        <p class="text-slate-500 text-[13.5px]">
          {{ perfis().length }} perfil(is) cadastrado(s) — perfis de sistema não podem ser excluídos.
        </p>
      </div>

      @if (error()) {
        <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">⚠ {{ error() }}</div>
      }

      <!-- Lista de perfis -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto hidden sm:block">
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-2.5">Perfil</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Permissões</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Usuários</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5 w-32"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4]; track i) {
                  <tr class="border-b border-slate-100"><td colspan="5" class="px-5 py-3">
                    <div class="h-4 bg-slate-100 rounded animate-pulse w-3/4"></div>
                  </td></tr>
                }
              } @else if (perfis().length === 0) {
                <tr><td colspan="5" class="px-5 py-12 text-center text-slate-400 text-sm">
                  Nenhum perfil cadastrado.
                </td></tr>
              } @else {
                @for (p of perfis(); track p.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-2">
                        <div class="font-semibold">{{ p.nome }}</div>
                        @if (p.sistema) {
                          <span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-semibold">SISTEMA</span>
                        }
                      </div>
                      @if (p.descricao) {
                        <div class="text-[11px] text-slate-400 truncate max-w-[300px]">{{ p.descricao }}</div>
                      }
                    </td>
                    <td class="px-4 py-3 font-mono text-[12.5px]">{{ p.permissoes.length }}</td>
                    <td class="px-4 py-3 font-mono text-[12.5px]">{{ p.totalUsuarios ?? 0 }}</td>
                    <td class="px-4 py-3">
                      @if (p.ativo) {
                        <span class="px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded text-[10px] font-semibold">ATIVO</span>
                      } @else {
                        <span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-semibold">INATIVO</span>
                      }
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-1">
                        <button *nbSe="'perfil.editar'" (click)="abrirModalEditar(p)"
                                class="px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                          Editar
                        </button>
                        @if (!p.sistema) {
                          <button *nbSe="'perfil.excluir'" (click)="confirmarExcluir(p)"
                                  class="px-2.5 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100">
                            Excluir
                          </button>
                        }
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
          } @else if (perfis().length === 0) {
            <div class="p-8 text-center text-slate-400 text-sm">Nenhum perfil cadastrado.</div>
          } @else {
            @for (p of perfis(); track p.id) {
              <div class="p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <div class="font-semibold text-[13.5px]">{{ p.nome }}</div>
                      @if (p.sistema) {
                        <span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-semibold">SISTEMA</span>
                      }
                      @if (!p.ativo) {
                        <span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-semibold">INATIVO</span>
                      }
                    </div>
                    @if (p.descricao) {
                      <div class="text-slate-400 text-[12px] mt-0.5">{{ p.descricao }}</div>
                    }
                    <div class="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                      <span>{{ p.permissoes.length }} permissão(ões)</span>
                      <span>·</span>
                      <span>{{ p.totalUsuarios ?? 0 }} usuário(s)</span>
                    </div>
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <button *nbSe="'perfil.editar'" (click)="abrirModalEditar(p)"
                            class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-sm transition-colors">✎</button>
                    @if (!p.sistema) {
                      <button *nbSe="'perfil.excluir'" (click)="confirmarExcluir(p)"
                              class="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg text-sm transition-colors">🗑</button>
                    }
                  </div>
                </div>
              </div>
            }
          }
        </div>
      </div>
    </div>

    <!-- ── Drawer: editor de perfil ─────────────────────────────────────────────── -->
    @if (showModal()) {
      <div class="fixed inset-0 bg-black/40 z-40" (click)="fecharModal()"></div>
      <div class="fixed right-0 top-0 h-full w-full sm:w-[560px] bg-white shadow-xl z-50 flex flex-col overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 class="font-display font-semibold text-lg">
            {{ editando() ? 'Editar perfil' : 'Novo perfil' }}
          </h2>
          <button (click)="fecharModal()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">✕</button>
        </div>

        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          <!-- Nome -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome *</label>
            <input [ngModel]="fNome()" (ngModelChange)="fNome.set($event)"
                   [disabled]="editandoPerfilSistema()"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 disabled:bg-slate-50 disabled:text-slate-500"
                   placeholder="Ex.: Financeiro" />
            @if (editandoPerfilSistema()) {
              <p class="text-[11px] text-slate-400 mt-1">Nome de perfil de sistema não pode ser alterado.</p>
            }
          </div>

          <!-- Descrição -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Descrição</label>
            <textarea [ngModel]="fDescricao()" (ngModelChange)="fDescricao.set($event)"
                      rows="2"
                      class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 resize-none"
                      placeholder="Para que serve este perfil?"></textarea>
          </div>

          <!-- Prioridade + Ativo -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Prioridade</label>
              <input [ngModel]="fPrioridade()" (ngModelChange)="fPrioridade.set(+$event)"
                     type="number" min="0" max="999" inputmode="numeric"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700" />
              <p class="text-[11px] text-slate-400 mt-1">0–999, maior = mais privilegiado.</p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Status</label>
              <label class="flex items-center gap-2 mt-2.5">
                <input type="checkbox" [checked]="fAtivo()" (change)="fAtivo.set(!fAtivo())"
                       class="w-4 h-4 accent-green-700" />
                <span class="text-sm">Ativo</span>
              </label>
            </div>
          </div>

          <!-- Permissões agrupadas por módulo -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-semibold text-slate-500 tracking-wide">
                Permissões ({{ fPermissoes().size }})
              </label>
              <div class="flex gap-1.5">
                <button (click)="marcarTodas()"
                        class="text-[11px] font-semibold text-green-700 hover:text-green-800">Marcar todas</button>
                <span class="text-slate-300 text-[11px]">·</span>
                <button (click)="limparPermissoes()"
                        class="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Limpar</button>
              </div>
            </div>
            @if (catalogoLoading()) {
              <div class="h-4 bg-slate-100 rounded animate-pulse w-3/4"></div>
            } @else {
              <div class="flex flex-col gap-2">
                @for (mod of catalogo(); track mod.codigo) {
                  <details class="bg-slate-50 border border-slate-200 rounded-[10px] overflow-hidden">
                    <summary class="px-3 py-2.5 cursor-pointer flex items-center justify-between text-[13px] font-semibold">
                      <div class="flex items-center gap-2">
                        <span>{{ mod.nome }}</span>
                        <span class="text-[10px] text-slate-400 font-mono">{{ contagemModulo(mod) }}/{{ mod.permissoes.length }}</span>
                      </div>
                      <button type="button" (click)="toggleModulo(mod, $event)"
                              class="text-[10.5px] font-semibold text-green-700 hover:text-green-800 px-1.5 py-0.5 rounded">
                        {{ moduloMarcado(mod) ? 'Desmarcar' : 'Marcar' }}
                      </button>
                    </summary>
                    <div class="px-3 pb-3 pt-1 flex flex-col gap-1.5 border-t border-slate-200 bg-white">
                      @for (perm of mod.permissoes; track perm.codigo) {
                        <label class="flex items-start gap-2 cursor-pointer hover:bg-slate-50 rounded p-1.5 -mx-1.5">
                          <input type="checkbox"
                                 [checked]="fPermissoes().has(perm.codigo)"
                                 (change)="togglePermissao(perm.codigo)"
                                 [disabled]="!auth.temPermissao(perm.codigo) && !auth.isMaster()"
                                 class="w-4 h-4 mt-0.5 accent-green-700" />
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                              <span class="text-[12.5px] font-medium">{{ perm.nome }}</span>
                              <span class="font-mono text-[10.5px] text-slate-400">{{ perm.codigo }}</span>
                            </div>
                            @if (perm.descricao) {
                              <div class="text-[11px] text-slate-400">{{ perm.descricao }}</div>
                            }
                            @if (!auth.temPermissao(perm.codigo) && !auth.isMaster()) {
                              <div class="text-[10.5px] text-orange-600 font-semibold mt-0.5">
                                Você não possui esta permissão e não pode atribuí-la.
                              </div>
                            }
                          </div>
                        </label>
                      }
                    </div>
                  </details>
                }
              </div>
            }
          </div>

          @if (modalError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ modalError() }}</div>
          }
        </div>

        <div class="px-6 py-4 border-t border-slate-200 flex gap-2.5 flex-shrink-0">
          <button (click)="fecharModal()"
                  class="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-sm rounded-[10px] transition-colors">
            Cancelar
          </button>
          <button (click)="salvar()" [disabled]="!podeSubmit() || modalLoading()"
                  class="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-[10px] transition-colors shadow-sm">
            {{ modalLoading() ? 'Salvando...' : editando() ? 'Salvar' : 'Criar' }}
          </button>
        </div>
      </div>
    }

    <!-- ── Confirmar exclusão ───────────────────────────────────────────────────── -->
    @if (excluindo()) {
      <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
          <h3 class="font-display font-semibold text-lg mb-2">Excluir perfil?</h3>
          <p class="text-slate-500 text-sm mb-1">
            <strong class="text-slate-700">{{ excluindo()!.nome }}</strong> será removido.
          </p>
          <p class="text-slate-400 text-xs mb-5">Usuários atribuídos ficarão sem este perfil. Não é possível excluir um perfil em uso.</p>
          <div class="flex gap-2.5">
            <button (click)="excluindo.set(null)"
                    class="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-sm rounded-[10px] transition-colors">
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
export class PerfisComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly perfisApi = inject(PerfilService);
  private readonly permissoesApi = inject(PermissaoService);

  perfis    = signal<Perfil[]>([]);
  loading   = signal(false);
  error     = signal('');

  catalogo        = signal<ModuloComPermissoes[]>([]);
  catalogoLoading = signal(false);

  showModal     = signal(false);
  editando      = signal<Perfil | null>(null);
  excluindo     = signal<Perfil | null>(null);
  modalLoading  = signal(false);
  modalError    = signal('');

  fNome        = signal('');
  fDescricao   = signal('');
  fPrioridade  = signal(0);
  fAtivo       = signal(true);
  fPermissoes  = signal<Set<CodigoPermissao>>(new Set());

  podeSubmit = computed(() =>
    this.fNome().trim().length >= 2 && this.fPermissoes().size > 0,
  );

  editandoPerfilSistema = computed(() => this.editando()?.sistema === true);

  ngOnInit(): void {
    this.load();
    this.carregarCatalogo();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.perfisApi.findAll());
      this.perfis.set(data);
    } catch {
      this.error.set('Erro ao carregar perfis.');
    } finally {
      this.loading.set(false);
    }
  }

  async carregarCatalogo(): Promise<void> {
    this.catalogoLoading.set(true);
    try {
      const data = await firstValueFrom(this.permissoesApi.catalogo());
      this.catalogo.set(data);
    } catch {
      // ignora — exibido em modalError ao tentar salvar
    } finally {
      this.catalogoLoading.set(false);
    }
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  abrirModalCriar(): void {
    this.editando.set(null);
    this.fNome.set('');
    this.fDescricao.set('');
    this.fPrioridade.set(0);
    this.fAtivo.set(true);
    this.fPermissoes.set(new Set());
    this.modalError.set('');
    this.showModal.set(true);
  }

  abrirModalEditar(p: Perfil): void {
    this.editando.set(p);
    this.fNome.set(p.nome);
    this.fDescricao.set(p.descricao ?? '');
    this.fPrioridade.set(p.prioridade);
    this.fAtivo.set(p.ativo);
    this.fPermissoes.set(new Set(p.permissoes));
    this.modalError.set('');
    this.showModal.set(true);
  }

  fecharModal(): void {
    this.showModal.set(false);
    this.editando.set(null);
    this.modalError.set('');
  }

  togglePermissao(codigo: CodigoPermissao): void {
    const set = new Set(this.fPermissoes());
    if (set.has(codigo)) set.delete(codigo);
    else set.add(codigo);
    this.fPermissoes.set(set);
  }

  toggleModulo(mod: ModuloComPermissoes, evt: Event): void {
    evt.preventDefault();
    evt.stopPropagation();
    const set = new Set(this.fPermissoes());
    const todasMarcadas = mod.permissoes.every((p) => set.has(p.codigo));
    for (const p of mod.permissoes) {
      if (!this.auth.temPermissao(p.codigo) && !this.auth.isMaster()) continue;
      if (todasMarcadas) set.delete(p.codigo);
      else set.add(p.codigo);
    }
    this.fPermissoes.set(set);
  }

  contagemModulo(mod: ModuloComPermissoes): number {
    const set = this.fPermissoes();
    return mod.permissoes.filter((p) => set.has(p.codigo)).length;
  }

  moduloMarcado(mod: ModuloComPermissoes): boolean {
    return this.contagemModulo(mod) === mod.permissoes.length;
  }

  marcarTodas(): void {
    const set = new Set<CodigoPermissao>();
    for (const m of this.catalogo()) {
      for (const p of m.permissoes) {
        if (this.auth.temPermissao(p.codigo) || this.auth.isMaster()) {
          set.add(p.codigo);
        }
      }
    }
    this.fPermissoes.set(set);
  }

  limparPermissoes(): void {
    this.fPermissoes.set(new Set());
  }

  async salvar(): Promise<void> {
    if (!this.podeSubmit() || this.modalLoading()) return;
    this.modalLoading.set(true);
    this.modalError.set('');
    try {
      const input = {
        nome: this.fNome().trim(),
        descricao: this.fDescricao().trim() || undefined,
        prioridade: this.fPrioridade(),
        ativo: this.fAtivo(),
        permissoes: Array.from(this.fPermissoes()),
      };
      const p = this.editando();
      if (p) {
        await firstValueFrom(this.perfisApi.update(p.id, input));
      } else {
        await firstValueFrom(this.perfisApi.create(input));
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

  confirmarExcluir(p: Perfil): void {
    this.excluindo.set(p);
    this.modalError.set('');
  }

  async excluir(): Promise<void> {
    const p = this.excluindo();
    if (!p) return;
    this.modalLoading.set(true);
    try {
      await firstValueFrom(this.perfisApi.delete(p.id));
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
}
