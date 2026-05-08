import { Injectable, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class PwaService {
  private installEvent: BeforeInstallPromptEvent | null = null;

  readonly canInstall  = signal(false);
  readonly installed   = signal(false);

  constructor() {
    // Captura o evento de instalação antes que o browser faça o prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    // Detecta quando PWA foi instalada
    window.addEventListener('appinstalled', () => {
      this.installed.set(true);
      this.canInstall.set(false);
      localStorage.setItem('pwa_installed', '1');
    });

    // Detecta se já está rodando como PWA instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.installed.set(true);
    }
  }

  async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.installEvent) return 'unavailable';
    await this.installEvent.prompt();
    const { outcome } = await this.installEvent.userChoice;
    this.installEvent = null;
    this.canInstall.set(false);
    return outcome;
  }

  wasBannerShown(key: string): boolean {
    return !!localStorage.getItem(`pwa_banner_${key}`);
  }

  markBannerShown(key: string): void {
    localStorage.setItem(`pwa_banner_${key}`, '1');
  }
}
