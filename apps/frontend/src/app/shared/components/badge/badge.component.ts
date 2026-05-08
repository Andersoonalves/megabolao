import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

export type BadgeVariant = 'default' | 'success' | 'warn' | 'danger' | 'info';

@Component({
  selector: 'nb-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `
    <span [ngClass]="classes()" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border">
      @if (dot()) {
        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
      }
      <ng-content />
    </span>
  `,
})
export class BadgeComponent {
  readonly variant = input<BadgeVariant>('default');
  readonly dot     = input<boolean>(false);

  classes() {
    const v = this.variant();
    return {
      'bg-slate-100 text-slate-700 border-slate-200':     v === 'default',
      'bg-green-50 text-green-800 border-green-200':      v === 'success',
      'bg-amber-50 text-amber-700 border-amber-100':      v === 'warn',
      'bg-red-50 text-red-700 border-red-200':            v === 'danger',
      'bg-blue-50 text-blue-600 border-blue-200':         v === 'info',
    };
  }
}
