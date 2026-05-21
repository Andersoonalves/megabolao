import { booleanAttribute, ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { I18nService, AppLang } from '../../../core/services/i18n.service';

@Component({
  selector: 'nb-lang-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div [class]="wrapClass()"
         [attr.aria-label]="'lang.switch' | translate">
      <button type="button"
              (click)="set('pt')"
              [class]="btnClass('pt')"
              [attr.aria-pressed]="i18n.lang() === 'pt'"
              title="Português">
        🇧🇷
      </button>
      <button type="button"
              (click)="set('en')"
              [class]="btnClass('en')"
              [attr.aria-pressed]="i18n.lang() === 'en'"
              title="English">
        🇺🇸
      </button>
    </div>
  `,
})
export class LangToggleComponent {
  /** Botões maiores + ícone (FAB / portal / login). */
  @Input({ transform: booleanAttribute }) prominent = false;

  readonly i18n = inject(I18nService);

  wrapClass(): string {
    return this.prominent
      ? 'inline-flex items-center rounded-xl border-2 border-green-800/25 bg-white shadow-md px-1 py-1 gap-0.5'
      : 'inline-flex items-center rounded-lg border border-slate-200 bg-white/90 p-0.5 shadow-sm';
  }

  btnClass(code: AppLang): string {
    const on = this.i18n.lang() === code;
    const size = this.prominent
      ? 'min-h-9 px-2.5 py-1.5 text-xl leading-none rounded-lg transition-all'
      : 'px-1.5 py-1 text-base leading-none rounded-md transition-all';
    return [size, on
      ? 'opacity-100 ring-2 ring-green-600 ring-offset-1 scale-110'
      : 'opacity-40 hover:opacity-70'].join(' ');
  }

  set(code: AppLang): void {
    void this.i18n.setLang(code);
  }
}
