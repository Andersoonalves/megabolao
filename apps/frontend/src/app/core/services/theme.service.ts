import { Injectable, computed, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'nb-theme';

/**
 * ThemeService — gerencia tema light/dark do sistema.
 *
 * - Persiste a preferência em localStorage (chave `nb-theme`).
 * - Aplica a classe `dark` no <html> (Tailwind darkMode: 'class').
 * - Atualiza meta `theme-color` para combinar com a UI nativa do navegador.
 * - Inicialização anti-flash é feita por script inline no index.html.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.readInitialTheme());

  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    effect(() => {
      const t = this._theme();
      this.apply(t);
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        /* localStorage indisponível (modo privado) — ignorar */
      }
    });
  }

  toggle(): void {
    this._theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }

  set(theme: Theme): void {
    this._theme.set(theme);
  }

  private readInitialTheme(): Theme {
    if (typeof document === 'undefined') return 'light';
    if (document.documentElement.classList.contains('dark')) return 'dark';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      /* ignore */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  private apply(theme: Theme): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset['theme'] = theme;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0a0b0d' : '#047857';
  }
}
