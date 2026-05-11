import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { PhoneMaskDirective, PhonePipe } from '../../../shared/phone';
import { LangToggleComponent } from '../../../shared/components/lang-toggle/lang-toggle.component';
import { PortalApiService } from '../portal-api.service';

type Step = 'phone' | 'otp';

@Component({
  selector: 'nb-portal-busca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PhoneMaskDirective, PhonePipe, TranslatePipe, LangToggleComponent],
  template: `
    <div class="min-h-[100dvh] min-h-screen w-full max-w-[100vw] overflow-x-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-white">
      <div class="flex flex-col justify-center w-full min-w-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10 lg:px-14 lg:py-12 overflow-y-auto overscroll-y-contain relative">
        <div class="fixed z-[100] drop-shadow-md"
             style="top: max(0.75rem, env(safe-area-inset-top, 0px)); right: max(0.75rem, env(safe-area-inset-right, 0px))">
          <nb-lang-toggle [prominent]="true" />
        </div>

        <div class="max-w-sm w-full mx-auto min-w-0">
          <div class="lg:hidden text-center mb-8 pt-7 pr-14">
            <div class="flex flex-wrap justify-center gap-2 mb-5 max-w-[200px] mx-auto">
              @for (n of [4,12,23,31,47,56]; track n) {
                <div class="w-10 h-10 rounded-full bg-green-50 text-green-900 border border-green-100 flex items-center justify-center font-mono font-semibold text-[13px] shadow-sm">
                  {{ n < 10 ? '0' + n : n }}
                </div>
              }
            </div>
            <h1 class="font-display text-[26px] font-semibold tracking-tight mb-2">{{ 'portalBusca.heroTitle' | translate }}</h1>
            <p class="text-slate-500 text-[13.5px]">{{ 'portalBusca.heroSubtitle' | translate }}</p>
          </div>

          <div class="hidden lg:flex items-center gap-3 mb-10">
            <div class="w-10 h-10 shrink-0 rounded-[10px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-lg tracking-tight">NB</div>
            <div class="min-w-0">
              <div class="font-display font-semibold text-lg truncate">{{ 'app.name' | translate }}</div>
              <div class="text-[11.5px] text-slate-500 leading-snug">{{ 'portalBusca.heroSubtitle' | translate }}</div>
            </div>
          </div>

          @if (step() === 'phone') {
            <h2 class="font-display text-2xl sm:text-3xl font-semibold tracking-tight mb-2">{{ 'portalBusca.phoneTitle' | translate }}</h2>
            <p class="text-slate-500 text-[13px] sm:text-[13.5px] mb-5 sm:mb-6 leading-relaxed">{{ 'portalBusca.phoneHint' | translate }}</p>

            @if (error()) {
              <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{{ error() }}</div>
            }

            <div class="flex flex-col gap-3.5">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'portalBusca.phoneLabel' | translate }}</label>
                <div class="relative">
                  <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold select-none">🇧🇷 +55</span>
                  <input phoneMask [(ngModel)]="celular" name="celular" type="tel" inputmode="numeric"
                         (keyup.enter)="enviarOtp()"
                         class="w-full pl-[72px] pr-4 py-3.5 border border-slate-200 rounded-[10px] text-[15px] font-mono tracking-wide focus:outline-none focus:border-green-700 focus:shadow-glow transition-all"
                         placeholder="(00) 9 0000-0000" />
                </div>
              </div>

              <button (click)="enviarOtp()" [disabled]="loading() || !celular"
                      class="w-full min-h-12 px-5 py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-[10px] transition-colors text-sm shadow-sm">
                {{ (loading() ? 'portalBusca.sending' : 'portalBusca.receiveCode') | translate }}
              </button>

              <div class="p-3.5 bg-green-50 border border-green-200 rounded-xl flex gap-2.5">
                <span class="text-green-700 flex-shrink-0 text-sm mt-0.5">✦</span>
                <p class="text-[12px] text-green-900 leading-relaxed">
                  <strong>{{ 'portalBusca.passwordlessBold' | translate }}</strong>
                  {{ 'portalBusca.passwordlessRest' | translate }}
                </p>
              </div>
            </div>
          } @else {
            <button (click)="voltarStep()" class="flex items-center gap-1.5 text-sm text-slate-500 mb-5 -ml-1 hover:text-slate-700 transition-colors">
              ‹ {{ 'common.back' | translate }}
            </button>

            <h2 class="font-display text-2xl sm:text-3xl font-semibold tracking-tight mb-2">{{ 'portalBusca.otpTitle' | translate }}</h2>
            <p class="text-slate-500 text-[13px] sm:text-[13.5px] mb-1">{{ 'portalBusca.otpHint' | translate }}</p>
            <p class="font-mono font-semibold text-green-700 text-sm mb-6">{{ celular | phone }}</p>

            @if (error()) {
              <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{{ error() }}</div>
            }

            <div class="flex flex-col gap-3.5">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'portalBusca.otpLabel' | translate }}</label>
                <input [(ngModel)]="otpToken" name="otp" type="tel" inputmode="numeric" maxlength="6"
                       (keyup.enter)="verificarOtp()"
                       class="w-full px-4 py-3.5 border border-slate-200 rounded-[10px] text-[22px] font-mono text-center tracking-[0.5em] focus:outline-none focus:border-green-700 focus:shadow-glow transition-all"
                       placeholder="000000" />
              </div>

              <button (click)="verificarOtp()" [disabled]="loading() || otpToken.length < 6"
                      class="w-full min-h-12 px-5 py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-[10px] transition-colors text-sm shadow-sm">
                {{ (loading() ? 'portalBusca.verifying' : 'portalBusca.enter') | translate }}
              </button>

              <button (click)="enviarOtp()" [disabled]="loading()"
                      class="w-full min-h-12 px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold rounded-[10px] transition-colors text-sm">
                {{ 'portalBusca.resendCode' | translate }}
              </button>
            </div>
          }
        </div>
      </div>

      <div class="hidden lg:flex min-w-0 items-center justify-center relative overflow-hidden"
           style="background: linear-gradient(140deg, #065f46, #064e3b 60%, #052e2a)">
        <div class="absolute inset-0" style="background-image: radial-gradient(circle at 20% 30%, rgba(251,191,36,0.18), transparent 40%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.25), transparent 50%)"></div>
        <div class="relative text-center text-white max-w-sm px-8">
          <div class="flex flex-wrap gap-2 justify-center mb-8 max-w-xs mx-auto">
            @for (n of [4, 12, 23, 31, 47, 56]; track n) {
              <div class="w-12 h-12 rounded-full bg-white/95 text-green-900 flex items-center justify-center font-mono font-semibold text-base shadow-lg">
                {{ n < 10 ? '0' + n : n }}
              </div>
            }
          </div>
          <h2 class="font-display text-[28px] font-semibold tracking-tight mb-3">{{ 'portalBusca.heroTitle' | translate }}</h2>
          <p class="text-white/75 text-sm leading-relaxed">{{ 'portalBusca.heroSubtitle' | translate }}</p>
          <div class="flex flex-wrap justify-center gap-8 mt-10 text-xs text-white/60">
            <div><strong class="text-white font-display text-xl block">10</strong>{{ 'portalCotas.accHits' | translate }}</div>
            <div><strong class="text-white font-display text-xl block">R$</strong>{{ 'portal.nav.prizes' | translate }}</div>
            <div><strong class="text-white font-display text-xl block">24h</strong>Portal</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PortalBuscaComponent {
  private readonly auth = inject(AuthService);
  private readonly portalApi = inject(PortalApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  celular  = '';
  otpToken = '';
  step     = signal<Step>('phone');
  loading  = signal(false);
  error    = signal('');

  async enviarOtp(): Promise<void> {
    if (!this.celular || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const digits = this.celular.replace(/\D/g, '');
      await this.portalApi.loginDireto(digits);
      await this.router.navigate(['/portal/cotas']);
    } catch (err) {
      this.error.set(this.errorMessage(err, 'portalBusca.errorSendCode'));
    } finally {
      this.loading.set(false);
    }
  }

  async verificarOtp(): Promise<void> {
    if (this.otpToken.length < 6 || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.verifyOtp(this.celular.replace(/\D/g, ''), this.otpToken);
      await this.router.navigate(['/portal/cotas']);
    } catch (err) {
      this.error.set(this.errorMessage(err, 'portalBusca.errorInvalidOtp'));
    } finally {
      this.loading.set(false);
    }
  }

  voltarStep(): void {
    this.step.set('phone');
    this.otpToken = '';
    this.error.set('');
  }

  private errorMessage(err: unknown, fallbackKey: string): string {
    if (typeof err === 'object' && err !== null && 'error' in err) {
      const payload = (err as { error?: { message?: string } }).error;
      if (payload?.message) return payload.message;
    }
    return err instanceof Error ? err.message : this.translate.instant(fallbackKey);
  }
}
