import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'nb-back-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button (click)="back()"
            title="Voltar"
            class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-lg leading-none flex-shrink-0">
      ‹
    </button>
  `,
})
export class BackButtonComponent {
  private readonly location = inject(Location);
  back(): void { this.location.back(); }
}
