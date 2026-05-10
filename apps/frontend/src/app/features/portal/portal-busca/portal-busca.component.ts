import { Component, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { PhoneMaskDirective, PhonePipe } from '../../../shared/phone';
import { LangToggleComponent } from '../../../shared/components/lang-toggle/lang-toggle.component';

type Step = 'phone' | 'otp';

@Component({
  selector: 'nb-portal-busca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, PhoneMaskDirective, PhonePipe, TranslatePipe, LangToggleComponent],
  template: `
    <div class="min-h-screen flex flex-col relative" style="background: linear-gradient(180deg, #065f46, #064e3b)">

      <div class="fixed top-3 right-3 z-[100]">
        <nb-lang-toggle [prominent]="true" />
      </div>

      <!-- Hero -->
      <div class="text-center text-white px-6 pt-14 pb-8 flex-shrink-0">
        <div class="flex flex-wrap justify-center gap-2 mb-6 max-w-[200px] mx-auto">
          @for (n of [4,12,23,31,47,56]; track n) {
            <div class="w-10 h-10 rounded-full bg-white/95 text-green-900 flex items-center justify-center font-mono font-semibold text-[13px] shadow-lg">
              {{ n < 10 ? '0' + n : n }}
            </div>
          }
        </div>
        <h1 class="font-display text-[26px] font-semibold tracking-tight mb-2">{{ 'portalBusca.heroTitle' | translate }}</h1>
        <p class="text-white/70 text-[13.5px]">{{ 'portalBusca.heroSubtitle' | translate }}</p>
      </div>

      <!-- Card -->
      <div class="bg-white flex-1 rounded-t-[32px] px-6 pt-8 pb-8 shadow-xl" style="padding-bottom: max(2rem, env(safe-area-inset-bottom))">

        @if (step() === 'phone') {
          <!-- Passo 1: telefone -->
          <h2 class="font-display text-[20px] font-semibold mb-1">{{ 'portalBusca.phoneTitle' | translate }}</h2>
          <p class="text-slate-400 text-[13px] mb-6">{{ 'portalBusca.phoneHint' | translate }}</p>

          @if (error()) {
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ error() }}</div>
          }

          <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'portalBusca.phoneLabel' | translate }}</label>
          <div class="relative mb-5">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold select-none">🇧🇷 +55</span>
            <input phoneMask [(ngModel)]="celular" name="celular" type="tel" inputmode="numeric"
                   (keyup.enter)="enviarOtp()"
                   class="w-full pl-[72px] pr-4 py-4 border border-slate-200 rounded-xl text-[15px] font-mono tracking-wide focus:outline-none focus:border-green-700"
                   placeholder="(00) 9 0000-0000" />
          </div>

          <button (click)="enviarOtp()" [disabled]="loading() || !celular"
                  class="w-full py-4 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors shadow-sm min-h-12">
            {{ (loading() ? 'portalBusca.sending' : 'portalBusca.receiveCode') | translate }}
          </button>

          <div class="mt-4 p-3.5 bg-green-50 border border-green-200 rounded-xl flex gap-2.5">
            <span class="text-green-700 flex-shrink-0 text-sm mt-0.5">✦</span>
            <p class="text-[12px] text-green-900 leading-relaxed">
              <strong>{{ 'portalBusca.passwordlessBold' | translate }}</strong>
              {{ 'portalBusca.passwordlessRest' | translate }}
            </p>
          </div>
        } @else {
          <!-- Passo 2: OTP -->
          <button (click)="voltarStep()" class="flex items-center gap-1.5 text-sm text-slate-500 mb-5 -ml-1 hover:text-slate-700 transition-colors">
            ‹ {{ 'common.back' | translate }}
          </button>

          <h2 class="font-display text-[20px] font-semibold mb-1">{{ 'portalBusca.otpTitle' | translate }}</h2>
          <p class="text-slate-400 text-[13px] mb-1">{{ 'portalBusca.otpHint' | translate }}</p>
          <p class="font-mono font-semibold text-green-700 text-sm mb-6">{{ celular | phone }}</p>

          @if (error()) {
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ error() }}</div>
          }

          <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'portalBusca.otpLabel' | translate }}</label>
          <input [(ngModel)]="otpToken" name="otp" type="tel" inputmode="numeric" maxlength="6"
                 (keyup.enter)="verificarOtp()"
                 class="w-full px-4 py-4 border border-slate-200 rounded-xl text-[22px] font-mono text-center tracking-[0.5em] focus:outline-none focus:border-green-700 mb-5"
                 placeholder="000000" />

          <button (click)="verificarOtp()" [disabled]="loading() || otpToken.length < 6"
                  class="w-full py-4 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors shadow-sm min-h-12">
            {{ (loading() ? 'portalBusca.verifying' : 'portalBusca.enter') | translate }}
          </button>

          <button (click)="enviarOtp()" [disabled]="loading()"
                  class="w-full mt-3 py-3 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            {{ 'portalBusca.resendCode' | translate }}
          </button>
        }

        <p class="text-center mt-6 text-[11.5px] text-slate-400">
          {{ 'portalBusca.adminAsk' | translate }}
          <a routerLink="/login" class="text-green-700 font-semibold no-underline">{{ 'portalBusca.adminLink' | translate }}</a>
        </p>
      </div>
    </div>
  `,
})
export class PortalBuscaComponent {
  private readonly auth = inject(AuthService);
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
      await this.auth.signInWithOtp(this.celular.replace(/\D/g, ''));
      this.otpToken = '';
      this.step.set('otp');
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : this.translate.instant('portalBusca.errorSendCode'),
      );
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
      this.error.set(
        err instanceof Error ? err.message : this.translate.instant('portalBusca.errorInvalidOtp'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  voltarStep(): void {
    this.step.set('phone');
    this.otpToken = '';
    this.error.set('');
  }
}
