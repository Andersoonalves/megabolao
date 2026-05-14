import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { Perfil, UsuarioRBAC } from '@nossobolao/shared-types';
import { AuthService } from '../../../core/services/auth.service';
import { PerfilService } from '../../../core/services/perfil.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { SePermissaoDirective } from '../../../shared/directives/se-permissao.directive';
import { PhoneMaskDirective } from '../../../shared/phone';

@Component({
  selector: 'nb-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, BackButtonComponent, SePermissaoDirective, PhoneMaskDirective, TranslatePipe],
  templateUrl: './usuarios.component.html',
})
export class UsuariosComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly usuariosApi = inject(UsuarioService);
  private readonly perfisApi = inject(PerfilService);
  private readonly translate = inject(TranslateService);

  usuarios       = signal<UsuarioRBAC[]>([]);
  loading        = signal(false);
  error          = signal('');

  perfis         = signal<Perfil[]>([]);
  perfisLoading  = signal(false);

  showModal      = signal(false);
  editandoPerfis = signal<UsuarioRBAC | null>(null);
  excluindo      = signal<UsuarioRBAC | null>(null);
  modalLoading   = signal(false);
  modalError     = signal('');

  fEmail    = signal('');
  fNome     = signal('');
  fCelular  = signal('');
  fPerfilIds = signal<Set<string>>(new Set());

  perfisDisponiveis = computed(() => this.perfis().filter((p) => p.ativo));

  podeSubmit = computed(() => {
    const ids = this.fPerfilIds();
    if (this.editandoPerfis()) return ids.size >= 0;
    const emailOk = /^[^@]+@[^@]+\.[^@]+$/.test(this.fEmail().trim());
    return emailOk && ids.size > 0;
  });

  ngOnInit(): void {
    this.load();
    this.carregarPerfis();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.usuariosApi.findAll());
      this.usuarios.set(data);
    } catch {
      this.error.set(this.translate.instant('errors.loadUsers'));
    } finally {
      this.loading.set(false);
    }
  }

  async carregarPerfis(): Promise<void> {
    this.perfisLoading.set(true);
    try {
      const data = await firstValueFrom(this.perfisApi.findAll());
      this.perfis.set(data);
    } catch {
      // ignora
    } finally {
      this.perfisLoading.set(false);
    }
  }

  abrirModalConvidar(): void {
    this.editandoPerfis.set(null);
    this.fEmail.set('');
    this.fNome.set('');
    this.fCelular.set('');
    this.fPerfilIds.set(new Set());
    this.modalError.set('');
    this.showModal.set(true);
  }

  abrirModalPerfis(u: UsuarioRBAC): void {
    this.editandoPerfis.set(u);
    this.fPerfilIds.set(new Set(u.perfis.map((p) => p.id)));
    this.modalError.set('');
    this.showModal.set(true);
  }

  fecharModal(): void {
    this.showModal.set(false);
    this.editandoPerfis.set(null);
    this.modalError.set('');
  }

  togglePerfil(id: string): void {
    const set = new Set(this.fPerfilIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.fPerfilIds.set(set);
  }

  async salvar(): Promise<void> {
    if (!this.podeSubmit() || this.modalLoading()) return;
    this.modalLoading.set(true);
    this.modalError.set('');
    try {
      const u = this.editandoPerfis();
      if (u) {
        await firstValueFrom(
          this.usuariosApi.atribuirPerfis(u.id, { perfilIds: Array.from(this.fPerfilIds()) }),
        );
      } else {
        await firstValueFrom(
          this.usuariosApi.create({
            email: this.fEmail().trim(),
            nome: this.fNome().trim() || undefined,
            celular: this.fCelular().replace(/\D/g, '') || undefined,
            perfilIds: Array.from(this.fPerfilIds()),
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

  confirmarExcluir(u: UsuarioRBAC): void {
    this.excluindo.set(u);
    this.modalError.set('');
  }

  async excluir(): Promise<void> {
    const u = this.excluindo();
    if (!u) return;
    this.modalLoading.set(true);
    try {
      await firstValueFrom(this.usuariosApi.delete(u.id));
      this.excluindo.set(null);
      await this.load();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('errors.removeUser');
      this.error.set(msg);
      this.excluindo.set(null);
    } finally {
      this.modalLoading.set(false);
    }
  }

  initials(email: string): string {
    return (email ?? '').slice(0, 2).toUpperCase();
  }
}
