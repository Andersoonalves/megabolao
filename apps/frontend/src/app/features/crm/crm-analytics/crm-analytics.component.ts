import { Component, signal, computed, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

interface Etapa { id: string; nome: string; cor: string; ordem: number; }
interface Contato { etapaId: string | null; participante: { cotas: { statusPagamento: string }[] } | null; }

@Component({
  selector: 'nb-crm-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, DecimalPipe, TranslatePipe],
  templateUrl: './crm-analytics.component.html',
})
export class CrmAnalyticsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  etapas   = signal<Etapa[]>([]);
  contatos = signal<Contato[]>([]);
  loading  = signal(true);
  error    = signal('');

  stats = computed(() => {
    const total = this.contatos().length;
    const porEtapa = this.etapas().map(e => {
      const n = this.contatos().filter(c => c.etapaId === e.id).length;
      return { ...e, count: n, pct: total > 0 ? Math.round(n / total * 100) : 0 };
    });
    const totalCotas  = this.contatos().reduce((s, c) => s + (c.participante?.cotas.length ?? 0), 0);
    const cotasPagas  = this.contatos().reduce((s, c) => s + (c.participante?.cotas.filter(x => x.statusPagamento === 'PAGO').length ?? 0), 0);
    const semEtapa    = this.contatos().filter(c => !c.etapaId).length;
    return { total, porEtapa, totalCotas, cotasPagas, semEtapa };
  });

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const d = await firstValueFrom(
        this.api.get<{ etapas: Etapa[]; contatos: Contato[] }>('/crm/contatos/kanban'),
      );
      this.etapas.set(d.etapas);
      this.contatos.set(d.contatos);
    } catch {
      this.error.set(this.translate.instant('crm.errLoad'));
    } finally {
      this.loading.set(false);
    }
  }
}
