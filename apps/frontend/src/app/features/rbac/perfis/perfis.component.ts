import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
  imports: [FormsModule, BackButtonComponent, SePermissaoDirective, TranslatePipe],
  templateUrl: './perfis.component.html',
})
export class PerfisComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly perfisApi = inject(PerfilService);
  private readonly permissoesApi = inject(PermissaoService);
  private readonly translate = inject(TranslateService);

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
      this.error.set(this.translate.instant('errors.loadProfiles'));
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
      const msg = (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('errors.saveGeneric');
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
      const msg = (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('errors.deleteProfile');
      this.error.set(msg);
      this.excluindo.set(null);
    } finally {
      this.modalLoading.set(false);
    }
  }
}
