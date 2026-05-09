import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';

/**
 * Botão de alternância light ↔ dark.
 *
 * Uso:
 *   <nb-theme-toggle />                          // padrão (botão ghost)
 *   <nb-theme-toggle [size]="'sm'" />            // versão compacta
 */
@Component({
  selector: 'nb-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="theme.toggle()"
      [class]="classes()"
      [attr.aria-label]="theme.isDark() ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
      [attr.title]="theme.isDark() ? 'Tema claro' : 'Tema escuro'">
      @if (theme.isDark()) {
        <!-- Sol (estamos no dark, oferece light) -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2"/><path d="M12 20v2"/>
          <path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>
          <path d="M2 12h2"/><path d="M20 12h2"/>
          <path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
        </svg>
      } @else {
        <!-- Lua (estamos no light, oferece dark) -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      }
    </button>
  `,
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);

  readonly size = input<'sm' | 'md'>('md');

  classes() {
    const base =
      'inline-flex items-center justify-center rounded-lg text-slate-500 ' +
      'hover:text-slate-900 hover:bg-slate-100 transition-colors';
    const sized = this.size() === 'sm' ? 'w-9 h-9' : 'w-10 h-10';
    return `${base} ${sized}`;
  }
}
