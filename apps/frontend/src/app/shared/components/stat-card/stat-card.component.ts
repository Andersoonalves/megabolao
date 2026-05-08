import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

export type StatAccent = 'green' | 'gold' | 'blue' | 'default';

@Component({
  selector: 'nb-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `
    <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
      <div class="flex justify-between items-start">
        <div>
          <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">{{ label() }}</div>
          <div class="font-display text-[28px] font-semibold tracking-tight mt-1 tabular">{{ value() }}</div>
          @if (delta()) {
            <div class="text-xs text-green-700 mt-0.5 flex items-center gap-1">{{ delta() }}</div>
          }
        </div>
        @if (icon()) {
          <div [ngClass]="iconBg()" class="w-9 h-9 rounded-[10px] inline-flex items-center justify-center text-lg">
            {{ icon() }}
          </div>
        }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label  = input.required<string>();
  readonly value  = input.required<string>();
  readonly delta  = input<string>('');
  readonly icon   = input<string>('');
  readonly accent = input<StatAccent>('green');

  iconBg() {
    const a = this.accent();
    return {
      'bg-green-50 text-green-700': a === 'green' || a === 'default',
      'bg-amber-50 text-amber-600':  a === 'gold',
      'bg-blue-50 text-blue-600':   a === 'blue',
    };
  }
}
