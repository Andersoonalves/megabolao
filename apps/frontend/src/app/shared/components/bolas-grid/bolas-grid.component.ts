import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { BolaComponent, BolaVariant, BolaSize } from '../bola/bola.component';

@Component({
  selector: 'nb-bolas-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BolaComponent],
  template: `
    <div class="grid place-items-center" [class]="gapClass()" [style.grid-template-columns]="'repeat(' + cols() + ', 1fr)'">
      @for (n of numbers; track n) {
        <nb-bola
          [number]="n"
          [variant]="getVariant(n)"
          [size]="size()" />
      }
    </div>
  `,
})
export class BolasGridComponent {
  readonly drawn = input<number[]>([]);
  readonly hit    = input<number[]>([]);
  readonly size   = input<BolaSize>('sm');
  readonly cols   = input<number>(10);
  /** Classes Tailwind de gap, ex.: \`gap-2\`, \`gap-0.5\`. */
  readonly gapClass = input<string>('gap-2');

  readonly numbers = Array.from({ length: 60 }, (_, i) => i + 1);

  getVariant(n: number): BolaVariant {
    if (this.hit().includes(n))   return 'hit';
    if (this.drawn().includes(n)) return 'drawn';
    return 'empty';
  }
}
