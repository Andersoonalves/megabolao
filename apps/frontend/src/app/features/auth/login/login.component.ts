import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'nb-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen grid" style="grid-template-columns: 1fr 1.1fr">

      <!-- Left: form -->
      <div class="flex flex-col justify-center px-14 py-12 overflow-auto">
        <div class="max-w-sm w-full mx-auto">

          <!-- Logo -->
          <div class="flex items-center gap-3 mb-10">
            <div class="w-10 h-10 rounded-[10px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-lg tracking-tight">NB</div>
            <div>
              <div class="font-display font-semibold text-lg">NossoBolão</div>
              <div class="text-[11.5px] text-slate-500">Plataforma multitenant</div>
            </div>
          </div>

          <h1 class="font-display text-3xl font-semibold tracking-tight mb-2">Entrar no painel</h1>
          <p class="text-slate-500 text-[13.5px] mb-6">Acesso de Master e Administrador.</p>

          @if (error()) {
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{{ error() }}</div>
          }

          <form (ngSubmit)="submit()" class="flex flex-col gap-3.5">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">E-mail</label>
              <input [(ngModel)]="email" name="email" type="email" autocomplete="email"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 focus:shadow-glow transition-all"
                     placeholder="voce@empresa.com.br" required />
            </div>
            <div>
              <div class="flex justify-between mb-1.5">
                <label class="text-xs font-semibold text-slate-500 tracking-wide">Senha</label>
                <a class="text-[11.5px] text-green-700 font-semibold no-underline">Esqueci minha senha</a>
              </div>
              <input [(ngModel)]="password" name="password" type="password" autocomplete="current-password"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 focus:shadow-glow transition-all"
                     placeholder="••••••••" required />
            </div>

            <button type="submit" [disabled]="loading()"
                    class="w-full min-h-12 px-5 py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-[10px] transition-colors text-sm shadow-sm">
              {{ loading() ? 'Entrando...' : 'Entrar' }}
            </button>

            <div class="text-center text-[11.5px] text-slate-400 my-1">OU</div>

            <a routerLink="/portal"
               class="w-full min-h-12 px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 font-semibold rounded-[10px] transition-colors text-sm text-center no-underline flex items-center justify-center gap-2">
              💬 Acessar portal do participante
            </a>
          </form>
        </div>
      </div>

      <!-- Right: hero -->
      <div class="hidden lg:flex items-center justify-center relative overflow-hidden"
           style="background: linear-gradient(140deg, #065f46, #064e3b 60%, #052e2a)">
        <div class="absolute inset-0" style="background-image: radial-gradient(circle at 20% 30%, rgba(251,191,36,0.18), transparent 40%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.25), transparent 50%)"></div>
        <div class="relative text-center text-white max-w-sm px-8">
          <div class="flex flex-wrap gap-2 justify-center mb-8 max-w-xs mx-auto">
            @for (n of [4, 12, 23, 31, 47, 56]; track n) {
              <div class="w-12 h-12 rounded-full bg-white/95 text-green-900 flex items-center justify-center font-mono font-semibold text-base shadow-lg">{{ n < 10 ? '0' + n : n }}</div>
            }
          </div>
          <h2 class="font-display text-[28px] font-semibold tracking-tight mb-3">Gestão de bolões da Mega-Sena, sem planilha.</h2>
          <p class="text-white/75 text-sm leading-relaxed">Premiações 100% configuráveis · Portal para participantes · Apuração automática · Integração WhatsApp.</p>
          <div class="flex justify-center gap-8 mt-10 text-xs text-white/60">
            <div><strong class="text-white font-display text-xl block">9.244</strong>cotas no bolão</div>
            <div><strong class="text-white font-display text-xl block">22</strong>premiados</div>
            <div><strong class="text-white font-display text-xl block">R$ 184k</strong>arrecadados</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  email    = '';
  password = '';
  loading  = signal(false);
  error    = signal('');

  constructor(private readonly auth: AuthService) {}

  async submit(): Promise<void> {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.signInWithEmail(this.email, this.password);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      this.loading.set(false);
    }
  }
}
