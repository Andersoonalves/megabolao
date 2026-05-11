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
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1 flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-2 text-[12.5px] min-w-0">
          <span class="text-slate-400">{{ 'novoTenant.breadcrumbPlatform' | translate }}</span>
          <span class="text-slate-300">›</span>
          <a routerLink="/tenants" class="text-slate-400 hover:text-slate-700 no-underline transition-colors shrink-0">{{ 'novoTenant.breadcrumbTenants' | translate }}</a>
          <span class="text-slate-300">›</span>
          <span class="font-semibold truncate">{{ 'novoTenant.breadcrumbNew' | translate }}</span>
        </div>
        <span class="font-display font-semibold text-[14px] sm:hidden truncate">{{ 'novoTenant.title' | translate }}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <a routerLink="/tenants"
           class="inline-flex items-center px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-700 transition-colors min-h-9">
          {{ 'novoTenant.cancel' | translate }}
        </a>
        <button type="button" (click)="submit()" [disabled]="loading()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9">
          {{ loading() ? ('novoTenant.submitting' | translate) : ('novoTenant.submitBtn' | translate) }}
        </button>
      </div>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-6">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">{{ 'novoTenant.title' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px]">{{ 'novoTenant.subtitle' | translate }}</p>
      </div>

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
          <span class="flex-shrink-0 mt-0.5">⚠</span>
          <span>{{ error() }}</span>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        <!-- Formulário -->
        <div class="flex flex-col gap-5">

          <!-- Identificação -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">{{ 'novoTenant.card1' | translate }}</h3>
            </div>
            <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">

              <!-- Nome -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'novoTenant.labelNome' | translate }} <span class="text-red-500">*</span>
                </label>
                <input [ngModel]="nome()" (ngModelChange)="onNomeChange($event)" name="nome"
                       class="w-full px-3 py-2.5 border rounded-[10px] text-sm focus:outline-none transition-colors"
                       [class]="fieldErr('nome') ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200 focus:border-green-700'"
                       [attr.placeholder]="'novoTenant.nomePh' | translate" />
                @if (fieldErr('nome')) {
                  <p class="text-[11px] text-red-600 mt-1 flex items-center gap-1">⚠ {{ fieldErr('nome')! | translate }}</p>
                }
              </div>

              <!-- Slug -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'novoTenant.labelSlug' | translate }} <span class="text-red-500">*</span>
                </label>
                <div class="flex items-center border rounded-[10px] overflow-hidden transition-colors"
                     [class]="fieldErr('slug') ? 'border-red-400 bg-red-50' : 'border-slate-200 focus-within:border-green-700'">
                  <span class="px-2.5 py-2.5 text-[11.5px] text-slate-400 bg-slate-50 border-r border-slate-200 whitespace-nowrap flex-shrink-0">
                    {{ 'novoTenant.slugPrefix' | translate }}
                  </span>
                  <input [ngModel]="slug()" (ngModelChange)="slug.set($event); slugEditado.set(true)" name="slug"
                         class="flex-1 px-2.5 py-2.5 text-sm font-mono focus:outline-none bg-transparent min-w-0"
                         [attr.placeholder]="'novoTenant.slugPh' | translate" />
                </div>
                @if (fieldErr('slug')) {
                  <p class="text-[11px] text-red-600 mt-1 flex items-center gap-1">⚠ {{ fieldErr('slug')! | translate }}</p>
                } @else if (slug()) {
                  <p class="text-[11px] text-green-700 mt-1">{{ 'novoTenant.slugOk' | translate: { slug: slug() } }}</p>
                }
              </div>

              <!-- CNPJ -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'novoTenant.labelCnpj' | translate }}</label>
                <input [ngModel]="cnpj()" (ngModelChange)="cnpj.set($event)" name="cnpj"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                       [attr.placeholder]="'novoTenant.cnpjPh' | translate" />
              </div>

              <!-- Taxa -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'novoTenant.labelTaxa' | translate }}</label>
                <input [ngModel]="taxa()" (ngModelChange)="taxa.set(+$event)" name="taxa"
                       type="number" min="0" max="100" step="0.01" inputmode="decimal"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm tabular focus:outline-none focus:border-green-700" />
              </div>
            </div>
          </div>

          <!-- Admin inicial -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">{{ 'novoTenant.card2' | translate }}</h3>
            </div>
            <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">

              <!-- Admin nome -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'novoTenant.labelAdminNome' | translate }} <span class="text-red-500">*</span>
                </label>
                <input [ngModel]="adminNome()" (ngModelChange)="adminNome.set($event)" name="adminNome"
                       class="w-full px-3 py-2.5 border rounded-[10px] text-sm focus:outline-none transition-colors"
                       [class]="fieldErr('adminNome') ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200 focus:border-green-700'"
                       [attr.placeholder]="'novoTenant.adminNomePh' | translate" />
                @if (fieldErr('adminNome')) {
                  <p class="text-[11px] text-red-600 mt-1 flex items-center gap-1">⚠ {{ fieldErr('adminNome')! | translate }}</p>
                }
              </div>

              <!-- Admin email -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'novoTenant.labelEmail' | translate }} <span class="text-red-500">*</span>
                </label>
                <input [ngModel]="adminEmail()" (ngModelChange)="adminEmail.set($event)" name="adminEmail"
                       type="email"
                       class="w-full px-3 py-2.5 border rounded-[10px] text-sm focus:outline-none transition-colors"
                       [class]="fieldErr('adminEmail') ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200 focus:border-green-700'"
                       [attr.placeholder]="'novoTenant.emailPh' | translate" />
                @if (fieldErr('adminEmail')) {
                  <p class="text-[11px] text-red-600 mt-1 flex items-center gap-1">⚠ {{ fieldErr('adminEmail')! | translate }}</p>
                }
              </div>

              <!-- Celular -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'novoTenant.labelCelular' | translate }}</label>
                <input phoneMask [ngModel]="adminCelular()" (ngModelChange)="adminCelular.set($event)" name="celular"
                       type="tel" inputmode="numeric"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                       [attr.placeholder]="'novoTenant.celularPh' | translate" />
              </div>

              <!-- Senha -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'novoTenant.labelSenha' | translate }} <span class="text-red-500">*</span>
                </label>
                <input [ngModel]="adminSenha()" (ngModelChange)="adminSenha.set($event)" name="adminSenha"
                       type="password"
                       class="w-full px-3 py-2.5 border rounded-[10px] text-sm focus:outline-none transition-colors"
                       [class]="fieldErr('adminSenha') ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200 focus:border-green-700'"
                       [attr.placeholder]="'novoTenant.senhaPh' | translate" />
                @if (fieldErr('adminSenha')) {
                  <p class="text-[11px] text-red-600 mt-1 flex items-center gap-1">⚠ {{ fieldErr('adminSenha')! | translate }}</p>
                }
              </div>

              <!-- Confirmar senha -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">
                  {{ 'novoTenant.labelConfirmSenha' | translate }} <span class="text-red-500">*</span>
                </label>
                <input [ngModel]="confirmarSenha()" (ngModelChange)="confirmarSenha.set($event)" name="confirmarSenha"
                       type="password"
                       class="w-full px-3 py-2.5 border rounded-[10px] text-sm focus:outline-none transition-colors"
                       [class]="fieldErr('confirmarSenha') ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200 focus:border-green-700'"
                       [attr.placeholder]="'novoTenant.confirmSenhaPh' | translate" />
                @if (fieldErr('confirmarSenha')) {
                  <p class="text-[11px] text-red-600 mt-1 flex items-center gap-1">⚠ {{ fieldErr('confirmarSenha')! | translate }}</p>
                }
              </div>
            </div>
          </div>

          <!-- Branding -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">{{ 'novoTenant.card3' | translate }}</h3>
            </div>
            <div class="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <!-- Cor primária -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'novoTenant.labelCor' | translate }}</label>
                <div class="flex gap-2">
                  <div class="w-10 h-10 rounded-lg border border-slate-200 flex-shrink-0 cursor-pointer"
                       [style.background]="corPrimaria()"
                       (click)="colorPicker.click()"></div>
                  <input #colorPicker type="color"
                         [ngModel]="corPrimaria()" (ngModelChange)="corPrimaria.set($event)"
                         name="corPicker" class="sr-only" />
                  <input [ngModel]="corPrimaria()" (ngModelChange)="corPrimaria.set($event)" name="corHex"
                         class="flex-1 px-2.5 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-green-700"
                         placeholder="#047857" />
                </div>
              </div>

              <!-- Logo URL -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'novoTenant.labelLogo' | translate }}</label>
                <input [ngModel]="logoUrl()" (ngModelChange)="logoUrl.set($event)" name="logo"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-700"
                       [attr.placeholder]="'novoTenant.logoPh' | translate" />
              </div>

              <!-- Nome customizado -->
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'novoTenant.labelNomeCustomShort' | translate }}</label>
                <input [ngModel]="nomeCustomizado()" (ngModelChange)="nomeCustomizado.set($event)" name="nomeCustom"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-700"
                       [attr.placeholder]="'novoTenant.nomeCustomPhShort' | translate" />
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar sticky -->
        <aside class="flex flex-col gap-4" style="position: sticky; top: 72px; align-self: start">

          <!-- Preview branding -->
          <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">{{ 'novoTenant.previewTitle' | translate }}</h3>
            </div>
            <div class="p-4">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-[10px] flex items-center justify-center font-display font-bold text-sm text-white shadow-sm"
                     [style.background]="corPrimaria() || '#047857'">
                  {{ initials(nomeCustomizado() || nome()) }}
                </div>
                <div>
                  <div class="font-display font-semibold text-[14px]">{{ nomeCustomizado() || nome() || ('novoTenant.previewFallbackName' | translate) }}</div>
                  <div class="text-[11px] text-slate-400">{{ slug() || ('novoTenant.previewSlugFallback' | translate) }}.nossobolao.com.br</div>
                </div>
              </div>
              <div class="text-[11.5px] text-slate-500 space-y-1.5">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-sm flex-shrink-0" [style.background]="corPrimaria()"></div>
                  <span class="font-mono">{{ corPrimaria() }}</span>
                </div>
                <div>{{ 'novoTenant.taxaResumo' | translate }} <strong>{{ taxa() }}%</strong></div>
              </div>
            </div>
          </div>

          <!-- Resumo de validação -->
          @if (submitted() && !valido()) {
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
              <div class="font-semibold text-[13px] text-red-800 mb-2">{{ 'novoTenant.validationTitle' | translate }}</div>
              <ul class="text-[12px] text-red-700 space-y-1">
                @for (e of todosErros(); track e) {
                  <li class="flex items-start gap-1.5"><span class="flex-shrink-0">•</span>{{ e | translate }}</li>
                }
              </ul>
            </div>
          } @else if (valido()) {
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-[12.5px] text-green-800">
              <span class="text-lg">✓</span> {{ 'novoTenant.validOk' | translate }}
            </div>
          }

          <!-- Recursos -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">{{ 'novoTenant.recursosTitle' | translate }}</h3>
            </div>
            <div class="p-4 flex flex-col gap-2">
              @for (rk of recursoKeys; track rk) {
                <div class="flex items-start gap-2 text-[12.5px]">
                  <span class="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                  <span>{{ rk | translate }}</span>
                </div>
              }
            </div>
          </div>

          <!-- LGPD -->
          <div class="p-3.5 bg-amber-50 border border-amber-100 rounded-lg text-[12px] text-amber-800 leading-relaxed">
            <strong>{{ 'novoTenant.lgpdStrong' | translate }}</strong>{{ 'novoTenant.lgpdRest' | translate }}
          </div>
        </aside>
      </div>
    </div>
  `,
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
