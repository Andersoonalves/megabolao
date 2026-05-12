import { Component, signal, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { PwaService } from '../../../core/services/pwa.service';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Banner PWA para Portal do Participante.
 * CLAUDE.md: azul #1F4E79, acima do bottom nav (bottom: 60px + safe-area), 1ª autenticação OTP.
 */
@Component({
  selector: 'nb-pwa-banner-portal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="fixed left-4 right-4 z-50 rounded-2xl px-4 py-3.5 shadow-xl flex items-center gap-3"
           style="background: #1F4E79; bottom: calc(60px + env(safe-area-inset-bottom, 0px))">
        <!-- Ícone -->
        <div class="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center font-display font-bold text-sm flex-shrink-0">
          NB
        </div>

        <!-- Texto -->
        <div class="flex-1 min-w-0 text-white">
          <div class="font-semibold text-[13px]">Adicionar à tela inicial</div>
          <div class="text-white/70 text-[11.5px]">Consulte seus palpites com um toque</div>
        </div>

        <!-- Ações -->
        <div class="flex gap-2 flex-shrink-0">
          <button (click)="dismiss()"
                  class="text-white/60 hover:text-white text-[12px] font-semibold transition-colors px-2 py-1.5">
            ✕
          </button>
          <button (click)="install()"
                  class="px-3.5 py-1.5 bg-white text-[#1F4E79] text-[12px] font-semibold rounded-lg transition-all hover:bg-white/90 min-h-8">
            Instalar
          </button>
        </div>
      </div>
    }
  `,
})
export class PwaBannerPortalComponent implements OnInit {
  private readonly pwa  = inject(PwaService);
  private readonly auth = inject(AuthService);

  readonly visible = signal(false);

  ngOnInit(): void {
    // Aparece na 1ª autenticação OTP (CLAUDE.md)
    if (this.pwa.installed() || this.pwa.wasBannerShown('portal') || !this.auth.isAuthenticated()) return;

    // Pequeno delay para não aparecer junto ao conteúdo
    setTimeout(() => {
      if (this.pwa.canInstall()) this.visible.set(true);
    }, 1500);
  }

  async install(): Promise<void> {
    const result = await this.pwa.promptInstall();
    if (result !== 'unavailable') {
      this.pwa.markBannerShown('portal');
      this.visible.set(false);
    }
  }

  dismiss(): void {
    this.pwa.markBannerShown('portal');
    this.visible.set(false);
  }
}
