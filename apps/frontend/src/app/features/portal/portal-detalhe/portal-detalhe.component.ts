import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'nb-portal-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="p-6">
      <h1 class="font-display text-xl font-semibold">{{ 'portalDetalhe.title' | translate }}</h1>
      <p class="text-slate-400 mt-2">{{ 'portalDetalhe.wip' | translate }}</p>
    </div>
  `,
})
export class PortalDetalheComponent {}
