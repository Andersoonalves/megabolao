import {
  Component, signal, computed, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { PhoneMaskDirective } from '../../../shared/phone';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

// Regex slug: letras minúsculas, números, hífens (não começa/termina com hífen)
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

@Component({
  selector: 'nb-novo-tenant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, RouterLink, PhoneMaskDirective, TranslatePipe],
  templateUrl: './novo-tenant.component.html',
})
export class NovoTenantComponent {
  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  // ── Form fields como signals (computed() só rastreia signals, não props simples) ──
  nome            = signal('');
  slug            = signal('');
  cnpj            = signal('');
  taxa            = signal(15);
  adminNome       = signal('');
  adminEmail      = signal('');
  adminCelular    = signal('');
  adminSenha      = signal('');
  confirmarSenha  = signal('');
  corPrimaria     = signal('#047857');
  logoUrl         = signal('');
  nomeCustomizado = signal('');

  slugEditado = signal(false);
  submitted   = signal(false);
  loading     = signal(false);
  error       = signal('');

  // ── Validação reativa ─────────────────────────────────────────────────────
  private slugValido = computed(() => SLUG_RE.test(this.slug()));

  private erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.nome().trim())        e['nome']      = 'novoTenant.errNome';
    if (!this.slug().trim())        e['slug']      = 'novoTenant.errSlug';
    else if (!this.slugValido())    e['slug']      = 'novoTenant.errSlugFmt';
    if (!this.adminNome().trim())   e['adminNome'] = 'novoTenant.errAdminNome';
    if (!this.adminEmail().trim())  e['adminEmail'] = 'novoTenant.errEmail';
    else if (!this.adminEmail().includes('@')) e['adminEmail'] = 'novoTenant.errEmailFmt';
    if (!this.adminSenha())         e['adminSenha'] = 'novoTenant.errSenha';
    else if (this.adminSenha().length < 8) e['adminSenha'] = 'novoTenant.errSenhaMin';
    if (!this.confirmarSenha())     e['confirmarSenha'] = 'novoTenant.errConfirm';
    else if (this.adminSenha() !== this.confirmarSenha()) e['confirmarSenha'] = 'novoTenant.errSenhaMismatch';
    return e;
  });

  valido    = computed(() => Object.keys(this.erros()).length === 0);
  todosErros = computed(() => Object.values(this.erros()));

  fieldErr(campo: string): string | null {
    if (!this.submitted()) return null;
    return this.erros()[campo] ?? null;
  }

  readonly recursoKeys = [
    'novoTenant.recurso1',
    'novoTenant.recurso2',
    'novoTenant.recurso3',
    'novoTenant.recurso4',
    'novoTenant.recurso5',
  ] as const;

  // ── Handlers ──────────────────────────────────────────────────────────────
  onNomeChange(value: string): void {
    this.nome.set(value);
    if (!this.slugEditado()) {
      this.slug.set(this.toSlug(value));
    }
  }

  private toSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    if (!this.valido() || this.loading()) return;

    this.loading.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.api.post('/tenants', {
          nome: this.nome().trim(),
          slug: this.slug().trim(),
          taxaAdministrativaPct: this.taxa(),
          adminEmail:   this.adminEmail().trim(),
          adminSenha:   this.adminSenha(),
          adminNome:    this.adminNome().trim() || undefined,
          adminCelular: this.adminCelular().replace(/\D/g, '') || undefined,
          branding: {
            corPrimaria: this.corPrimaria(),
            ...(this.logoUrl()        && { logoUrl:         this.logoUrl() }),
            ...(this.nomeCustomizado() && { nomeCustomizado: this.nomeCustomizado() }),
          },
        }),
      );
      await this.router.navigate(['/tenants']);
    } catch (err: unknown) {
      // HttpErrorResponse: err.error = corpo da resposta, err.status = código HTTP
      type HttpErr = { error?: { message?: string; error?: string }; status?: number; message?: string };
      const e = err as HttpErr;
      const body = e.error?.message ?? e.error?.error ?? e.message ?? '';
      const status = e.status ? ` [${e.status}]` : '';
      console.error('Erro ao criar tenant:', err);
      this.error.set(body
        ? `${body}${status}`
        : `${this.translate.instant('novoTenant.errSubmitGeneric')}${status}`
      );
    } finally {
      this.loading.set(false);
    }
  }

  initials(nome: string): string {
    return (nome || 'NB').split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'NB';
  }
}
