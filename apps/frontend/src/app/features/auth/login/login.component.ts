import { Component, signal, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { LangToggleComponent } from '../../../shared/components/lang-toggle/lang-toggle.component';

@Component({
  selector: 'nb-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslatePipe, LangToggleComponent],
  template: `
    <div
      class="min-h-[100dvh] min-h-screen w-full max-w-[100vw] overflow-x-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">

      <!-- Left: form -->
      <div
        class="flex flex-col justify-center w-full min-w-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10 lg:px-14 lg:py-12 overflow-y-auto overscroll-y-contain relative">
        <div
          class="fixed z-[100] drop-shadow-md"
          style="top: max(0.75rem, env(safe-area-inset-top, 0px)); right: max(0.75rem, env(safe-area-inset-right, 0px))">
          <nb-lang-toggle [prominent]="true" />
        </div>
        <div class="max-w-sm w-full mx-auto min-w-0">

          <!-- Logo -->
          <div class="flex items-center gap-3 mb-6 sm:mb-10 pr-14 sm:pr-0">
            <div class="w-10 h-10 shrink-0 rounded-[10px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-lg tracking-tight">NB</div>
            <div class="min-w-0">
              <div class="font-display font-semibold text-lg truncate">{{ 'app.name' | translate }}</div>
              <div class="text-[11.5px] text-slate-500 leading-snug">{{ 'app.tagline' | translate }}</div>
            </div>
          </div>

          <h1 class="font-display text-2xl sm:text-3xl font-semibold tracking-tight mb-2">{{ 'auth.signInTitle' | translate }}</h1>
          <p class="text-slate-500 text-[13px] sm:text-[13.5px] mb-5 sm:mb-6 leading-relaxed">{{ 'auth.signInSubtitle' | translate }}</p>

          @if (sessionExpired()) {
            <div class="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900" role="alert">
              <div class="font-semibold mb-0.5">{{ 'auth.sessionExpiredTitle' | translate }}</div>
              <div class="text-amber-800/90 leading-relaxed">{{ 'auth.sessionExpiredMessage' | translate }}</div>
            </div>
          }

          @if (error()) {
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{{ error() }}</div>
          }

          @if (showMfaChallenge()) {
            <!-- Step 2: TOTP challenge -->
            <div class="flex flex-col gap-4">
              <div class="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
                <div class="text-3xl mb-2">🔐</div>
                <div class="font-semibold text-[14px] text-slate-800 mb-1">Verificação em dois fatores</div>
                <div class="text-[12.5px] text-slate-500">Insira o código de 6 dígitos do seu aplicativo autenticador.</div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Código TOTP</label>
                <input [ngModel]="totpCode()" (ngModelChange)="totpCode.set($event)"
                       name="totp" type="text" inputmode="numeric" autocomplete="one-time-code"
                       maxlength="6" placeholder="000000"
                       class="w-full px-3 py-3 border border-slate-200 rounded-[10px] text-center text-2xl font-mono tracking-[0.4em] focus:outline-none focus:border-green-700 transition-all" />
              </div>
              <button type="button" (click)="submitMfa()"
                      [disabled]="totpCode().length !== 6 || loadingMfa()"
                      class="w-full min-h-12 px-5 py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-[10px] transition-colors text-sm shadow-sm">
                {{ loadingMfa() ? 'Verificando…' : 'Verificar' }}
              </button>
              <button type="button" (click)="voltarLogin()"
                      class="text-[12.5px] text-slate-400 hover:text-slate-600 text-center transition-colors">
                ← Voltar ao login
              </button>
            </div>
          } @else {

          <form (ngSubmit)="submit()" class="flex flex-col gap-3.5">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'auth.email' | translate }}</label>
              <input [(ngModel)]="email" name="email" type="email" autocomplete="email"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 focus:shadow-glow transition-all"
                     [attr.placeholder]="'auth.emailPlaceholder' | translate" required />
            </div>
            <div>
              <div class="flex flex-col gap-1 mb-1.5 sm:flex-row sm:items-center sm:justify-between">
                <label class="text-xs font-semibold text-slate-500 tracking-wide">{{ 'auth.password' | translate }}</label>
                <a class="text-[11.5px] text-green-700 font-semibold no-underline cursor-pointer self-start sm:self-auto shrink-0">{{ 'auth.forgotPassword' | translate }}</a>
              </div>
              <div class="relative">
                <input [(ngModel)]="password" name="password"
                       [type]="showPassword() ? 'text' : 'password'"
                       autocomplete="current-password"
                       class="w-full pl-3 pr-10 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 transition-all"
                       placeholder="••••••••" required />
                <button type="button"
                        (click)="togglePassword()"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                        [title]="(showPassword() ? 'auth.hidePassword' : 'auth.showPassword') | translate">
                  @if (showPassword()) {
                    <!-- olho fechado -->
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  } @else {
                    <!-- olho aberto -->
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  }
                </button>
              </div>
            </div>

            <button type="submit" [disabled]="loading()"
                    class="w-full min-h-12 px-5 py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-[10px] transition-colors text-sm shadow-sm">
              {{ (loading() ? 'auth.signingIn' : 'auth.signIn') | translate }}
            </button>

            <div class="text-center text-[11.5px] text-slate-400 my-1">{{ 'auth.or' | translate }}</div>

            <a routerLink="/portal/login"
               class="w-full min-h-12 px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 font-semibold rounded-[10px] transition-colors text-sm text-center no-underline flex items-center justify-center gap-2">
              💬 {{ 'auth.portalLink' | translate }}
            </a>
          </form>
          } <!-- end @else (form normal) -->
        </div>
      </div>

      <!-- Right: hero (desktop) -->
      <div class="hidden lg:flex min-w-0 items-center justify-center relative overflow-hidden"
           style="background: linear-gradient(140deg, #065f46, #064e3b 60%, #052e2a)">
        <div class="absolute inset-0" style="background-image: radial-gradient(circle at 20% 30%, rgba(251,191,36,0.18), transparent 40%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.25), transparent 50%)"></div>
        <div class="relative text-center text-white max-w-sm px-8">
          <div class="flex flex-wrap gap-2 justify-center mb-8 max-w-xs mx-auto">
            @for (n of [4, 12, 23, 31, 47, 56]; track n) {
              <div class="w-12 h-12 rounded-full bg-white/95 text-green-900 flex items-center justify-center font-mono font-semibold text-base shadow-lg">{{ n < 10 ? '0' + n : n }}</div>
            }
          </div>
          <h2 class="font-display text-[28px] font-semibold tracking-tight mb-3">{{ 'auth.heroTitle' | translate }}</h2>
          <p class="text-white/75 text-sm leading-relaxed">{{ 'auth.heroSubtitle' | translate }}</p>
          <div class="flex flex-wrap justify-center gap-6 sm:gap-8 mt-10 text-xs text-white/60">
            <div><strong class="text-white font-display text-xl block">9.244</strong>{{ 'auth.heroStatCotas' | translate }}</div>
            <div><strong class="text-white font-display text-xl block">22</strong>{{ 'auth.heroStatPremiados' | translate }}</div>
            <div><strong class="text-white font-display text-xl block">R$ 184k</strong>{{ 'auth.heroStatArrec' | translate }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  email        = '';
  password     = '';
  showPassword = signal(false);
  loading      = signal(false);

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }
  error        = signal('');
  sessionExpired = signal(false);

  // Step 2: TOTP challenge
  showMfaChallenge = signal(false);
  totpCode         = signal('');
  loadingMfa       = signal(false);

  ngOnInit(): void {
    this.sessionExpired.set(this.auth.consumeSessionExpiredNotice());
    this.email = localStorage.getItem('nb_last_email') ?? '';
  }

  async submit(): Promise<void> {
    if (!this.email || !this.password) return;
    localStorage.setItem('nb_last_email', this.email);
    this.loading.set(true);
    this.error.set('');
    try {
      const { needsMfa } = await this.auth.signInWithEmail(this.email, this.password);
      if (needsMfa) this.showMfaChallenge.set(true);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : this.translate.instant('auth.loginError'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  async submitMfa(): Promise<void> {
    const code = this.totpCode().replace(/\s/g, '');
    if (code.length !== 6) return;
    this.loadingMfa.set(true);
    this.error.set('');
    try {
      await this.auth.verifyTotpChallenge(code);
      await this.auth.navigateAfterLogin();
    } catch {
      this.error.set('Código inválido ou expirado. Tente novamente.');
      this.totpCode.set('');
    } finally {
      this.loadingMfa.set(false);
    }
  }

  voltarLogin(): void {
    this.showMfaChallenge.set(false);
    this.totpCode.set('');
    this.error.set('');
  }
}
