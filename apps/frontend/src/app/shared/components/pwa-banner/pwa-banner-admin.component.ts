import { Component, signal, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { PwaService } from '../../../core/services/pwa.service';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Banner PWA para área Admin.
 * CLAUDE.md: branco, âncora na base, aparece 30s após login.
 */
@Component({
  selector: 'nb-pwa-banner-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg px-5 py-4 flex items-center gap-4 animate-fade-in">
        <!-- Ícone -->
        <div class="w-10 h-10 rounded-[10px] bg-gradient-to-br from-green-700 to-green-900 text-white flex items-center justify-center font-display font-bold text-sm flex-shrink-0">
          NB
        </div>

        <!-- Texto -->
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-[13.5px]">Instalar NossoBolão</div>
          <div class="text-slate-400 text-[12px]">Acesse mais rápido pelo ícone na área de trabalho</div>
        </div>

        <!-- Ações -->
        <div class="flex gap-2 flex-shrink-0">
          <button (click)="dismiss()"
                  class="px-3 py-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            Agora não
          </button>
          <button (click)="install()"
                  class="px-4 py-1.5 bg-green-700 hover:bg-green-800 text-white text-[12.5px] font-semibold rounded-lg transition-colors shadow-sm min-h-8">
            Instalar
          </button>
        </div>
      </div>
    }
  `,
})
export class PwaBannerAdminComponent implements OnInit, OnDestroy {
  private readonly pwa  = inject(PwaService);
  private readonly auth = inject(AuthService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly visible = signal(false);

  ngOnInit(): void {
    // Não mostra se: já instalado, banner já dispensado, ou usuário não autenticado
    if (this.pwa.installed() || this.pwa.wasBannerShown('admin') || !this.auth.isAuthenticated()) return;

    // Aparece 30s após login (CLAUDE.md)
    this.timer = setTimeout(() => {
      if (this.pwa.canInstall()) this.visible.set(true);
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  async install(): Promise<void> {
    const result = await this.pwa.promptInstall();
    if (result === 'accepted') {
      this.pwa.markBannerShown('admin');
      this.visible.set(false);
    }
  }

  dismiss(): void {
    this.pwa.markBannerShown('admin');
    this.visible.set(false);
  }
}
