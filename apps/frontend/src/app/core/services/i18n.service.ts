import { Injectable, computed, signal, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

export type AppLang = 'pt' | 'en';

const STORAGE_KEY = 'nb-lang';

/** Locales usados por pipes do Angular (datas, moeda) quando alinharmos LOCALE_ID. */
const LOCALE_BY_LANG: Record<AppLang, string> = {
  pt: 'pt-BR',
  en: 'en-US',
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly translate = inject(TranslateService);

  private readonly _lang = signal<AppLang>('pt');

  /** Código curto usado pelo ngx-translate (`pt` | `en`). */
  readonly lang = this._lang.asReadonly();

  /** Locale BCP 47 para `document.documentElement.lang` e futuro LOCALE_ID. */
  readonly htmlLang = computed(() => LOCALE_BY_LANG[this._lang()]);

  /**
   * Chamado no APP_INITIALIZER: aplica idioma persistido ou idioma do navegador.
   */
  async init(): Promise<void> {
    const chosen = this.resolveInitialLang();
    await firstValueFrom(this.translate.use(chosen));
    this._lang.set(chosen);
    this.applyDocumentLang(chosen);
  }

  /** Troca o idioma em runtime e persiste em `localStorage`. */
  async setLang(lang: AppLang): Promise<void> {
    await firstValueFrom(this.translate.use(lang));
    this._lang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    this.applyDocumentLang(lang);
  }

  private resolveInitialLang(): AppLang {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as AppLang | null;
      if (stored === 'pt' || stored === 'en') return stored;
    } catch {
      /* ignore */
    }
    const browser = (this.translate.getBrowserLang() ?? 'pt').toLowerCase().split('-')[0];
    return browser === 'en' ? 'en' : 'pt';
  }

  private applyDocumentLang(lang: AppLang): void {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = LOCALE_BY_LANG[lang];
  }
}
