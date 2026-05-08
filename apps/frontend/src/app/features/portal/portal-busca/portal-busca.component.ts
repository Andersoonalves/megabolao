import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'nb-portal-busca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen flex flex-col" style="background: linear-gradient(180deg, #065f46, #064e3b)">

      <!-- Hero -->
      <div class="text-center text-white px-6 pt-16 pb-8">
        <div class="flex flex-wrap justify-center gap-1.5 mb-6 max-w-[200px] mx-auto">
          @for (n of [4,12,23,31,47,56]; track n) {
            <div class="w-9 h-9 rounded-full bg-white/95 text-green-900 flex items-center justify-center font-mono font-semibold text-sm shadow-lg">
              {{ n < 10 ? '0' + n : n }}
            </div>
          }
        </div>
        <h1 class="font-display text-[26px] font-semibold tracking-tight mb-2">Bolão CG</h1>
        <p class="text-white/70 text-[13.5px]">Consulte seus palpites e prêmios pelo celular</p>
      </div>

      <!-- Form card -->
      <div class="bg-white flex-1 rounded-t-[32px] px-6 pt-8 pb-safe-bottom shadow-xl">
        <h2 class="font-display text-[19px] font-semibold mb-1">Acesse com seu celular</h2>
        <p class="text-slate-400 text-[12.5px] mb-6">Enviaremos um link mágico para acesso seguro</p>

        @if (error()) {
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{{ error() }}</div>
        }
        @if (sent()) {
          <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
            ✓ Link enviado para <strong>{{ celular }}</strong>. Verifique seu WhatsApp ou SMS.
          </div>
        }

        <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Número de celular</label>
        <div class="relative mb-5">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold">🇧🇷 +55</span>
          <input [(ngModel)]="celular" name="celular" type="tel" inputmode="numeric"
                 class="w-full pl-20 pr-4 py-3.5 border border-slate-200 rounded-xl text-[15px] focus:outline-none focus:border-green-700 focus:shadow-glow tracking-wide"
                 placeholder="(00) 0 0000-0000" />
        </div>

        <button (click)="submit()" [disabled]="loading() || !celular"
                class="w-full min-h-12 px-5 py-3.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm flex items-center justify-center gap-2">
          {{ loading() ? 'Enviando...' : 'Receber link de acesso' }} →
        </button>

        <div class="mt-4 p-3 bg-green-50 rounded-xl flex gap-2.5">
          <span class="text-green-700 text-sm flex-shrink-0 mt-0.5">✦</span>
          <p class="text-[11.5px] text-green-900 leading-relaxed"><strong>Acesso sem senha.</strong> Magic Link via WhatsApp ou email cadastrado pelo seu administrador.</p>
        </div>

        <p class="text-center mt-6 text-[11.5px] text-slate-400">
          Administrador? <a routerLink="/login" class="text-green-700 font-semibold no-underline">Entrar no painel</a>
        </p>
      </div>
    </div>
  `,
})
export class PortalBuscaComponent {
  celular  = '';
  loading  = signal(false);
  error    = signal('');
  sent     = signal(false);

  constructor(private readonly auth: AuthService) {}

  async submit(): Promise<void> {
    if (!this.celular) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.signInWithOtp(this.celular);
      this.sent.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao enviar link');
    } finally {
      this.loading.set(false);
    }
  }
}
