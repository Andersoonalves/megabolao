import {
  Component, input, output, ChangeDetectionStrategy, HostListener,
} from '@angular/core';

export type ConfirmModalVariant = 'danger' | 'warning' | 'info';

@Component({
  selector: 'nb-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'cm-title-' + _uid">

        <!-- Overlay -->
        <div
          class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
          (click)="onCancel()">
        </div>

        <!-- Panel -->
        <div
          class="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/8 p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">

          <!-- Icon + Title -->
          <div class="flex items-start gap-3">
            <div [class]="iconWrap()">
              <span class="text-lg leading-none">{{ icon() }}</span>
            </div>
            <div class="flex-1 min-w-0 pt-0.5">
              <h2 [id]="'cm-title-' + _uid"
                  class="font-display font-semibold text-[15px] text-slate-900 leading-snug">
                {{ title() }}
              </h2>
              @if (message()) {
                <p class="text-[13px] text-slate-500 mt-1 leading-relaxed">{{ message() }}</p>
              }
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-2.5 justify-end">
            <button
              type="button"
              (click)="onCancel()"
              class="px-4 py-2 min-h-10 rounded-lg text-[13px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              {{ cancelLabel() }}
            </button>
            <button
              type="button"
              (click)="onConfirm()"
              [class]="confirmBtnClass()">
              {{ confirmLabel() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmModalComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly open         = input.required<boolean>();
  readonly title        = input.required<string>();
  readonly message      = input<string>('');
  readonly confirmLabel = input<string>('Confirmar');
  readonly cancelLabel  = input<string>('Cancelar');
  readonly variant      = input<ConfirmModalVariant>('danger');

  // ── Outputs ───────────────────────────────────────────────────────────────
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  // Unique id for aria-labelledby (avoids collision when multiple modals exist)
  readonly _uid = Math.random().toString(36).slice(2, 7);

  @HostListener('document:keydown.escape')
  onEsc(): void { if (this.open()) this.onCancel(); }

  onConfirm(): void { this.confirmed.emit(); }
  onCancel():  void { this.cancelled.emit(); }

  icon(): string {
    return { danger: '🗑️', warning: '⚠️', info: 'ℹ️' }[this.variant()];
  }

  iconWrap(): string {
    const base = 'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ';
    return base + ({
      danger:  'bg-red-50',
      warning: 'bg-amber-50',
      info:    'bg-blue-50',
    }[this.variant()]);
  }

  confirmBtnClass(): string {
    const base = 'px-4 py-2 min-h-10 rounded-lg text-[13px] font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 ';
    return base + ({
      danger:  'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400',
      warning: 'bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-400',
      info:    'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-400',
    }[this.variant()]);
  }
}
