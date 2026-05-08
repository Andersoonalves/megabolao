import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { NgClass } from '@angular/common';

export type BolaVariant = 'default' | 'drawn' | 'hit' | 'empty';
export type BolaSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'nb-bola',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `
    <span [ngClass]="classes()">{{ numStr() }}</span>
  `,
})
export class BolaComponent {
  readonly number = input.required<number>();
  readonly variant = input<BolaVariant>('default');
  readonly size = input<BolaSize>('md');

  numStr() {
    return String(this.number()).padStart(2, '0');
  }

  classes() {
    const s = this.size();
    const v = this.variant();
    return [
      'inline-flex items-center justify-center rounded-full font-mono font-semibold border select-none',
      s === 'sm' ? 'w-7 h-7 text-[11px]' : s === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-[13px]',
      v === 'drawn' ? 'bg-green-700 text-white border-green-700 shadow-sm' :
      v === 'hit'   ? 'bg-gold-500 text-white border-gold-500 shadow-sm' :
      v === 'empty' ? 'text-slate-400 border-slate-200 bg-white' :
                      'bg-white text-slate-900 border-slate-200',
    ];
  }
}
