import { Component, ChangeDetectionStrategy, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PortalApiService, PortalBolao } from '../portal-api.service';

@Component({
  selector: 'nb-portal-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="bg-green-800 text-white px-4 pt-4 pb-5">
      <h1 class="font-display text-[22px] font-semibold tracking-tight mb-1">{{ 'portalDetalhe.title' | translate }}</h1>
      <p class="text-white/60 text-[13px]">{{ 'portalDetalhe.subtitle' | translate:{ n: totalPremios() } }}</p>
    </div>

    <div class="px-4 py-4 flex flex-col gap-4">
      @if (loading()) {
        @for (i of [1,2,3]; track i) {
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div class="h-4 w-40 bg-slate-100 rounded animate-pulse mb-3"></div>
            <div class="h-12 bg-slate-100 rounded animate-pulse"></div>
          </div>
        }
      } @else if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {{ error() }}
        </div>
      } @else if (boloes().length === 0 || totalPremios() === 0) {
        <div class="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-100">
          <div class="text-3xl mb-3">🏆</div>
          <p class="font-semibold text-slate-700">{{ 'portalDetalhe.emptyTitle' | translate }}</p>
          <p class="text-slate-400 text-xs mt-1">{{ 'portalDetalhe.emptyHint' | translate }}</p>
        </div>
      } @else {
        @for (bolao of boloes(); track bolao.id) {
          @if (premiosDoBolao(bolao).length > 0) {
            <section class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
              <div class="px-4 py-3 border-b border-slate-100">
                <div class="font-display font-semibold text-[14.5px]">{{ bolao.nome }}</div>
                <div class="text-[11px] text-slate-400">{{ statusLabel(bolao.status) }}</div>
              </div>
              <div class="divide-y divide-slate-100">
                @for (item of premiosDoBolao(bolao); track item.premio.id) {
                  <div class="p-4 flex items-start gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">🏆</div>
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold text-[13.5px] truncate">{{ item.premio.categoriaNome }}</div>
                      <div class="text-[11.5px] text-slate-400 mt-0.5">
                        {{ 'portalDetalhe.quotaNum' | translate:{ n: item.cotaNumero } }}
                      </div>
                      <div class="mt-2 inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-semibold"
                           [class]="item.premio.statusPagamento === 'PAGO' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'">
                        {{ payStatus(item.premio.statusPagamento) }}
                      </div>
                    </div>
                    <div class="text-right shrink-0">
                      <div class="font-mono font-bold text-[14px] text-slate-800">{{ fmtBrl(item.premio.valorPorGanhador) }}</div>
                      @if (item.premio.dataPagamento) {
                        <div class="text-[10.5px] text-slate-400 mt-1">{{ fmtDate(item.premio.dataPagamento) }}</div>
                      }
                    </div>
                  </div>
                }
              </div>
            </section>
          }
        }
      }
    </div>
  `,
})
export class PortalDetalheComponent implements OnInit {
  private readonly portalApi = inject(PortalApiService);
  private readonly translate = inject(TranslateService);

  readonly boloes = signal<PortalBolao[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly totalPremios = computed(() =>
    this.boloes().flatMap(b => b.cotas).flatMap(c => c.premios).length,
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const resumo = await this.portalApi.resumo();
      this.boloes.set(resumo.boloes);
    } catch {
      this.error.set(this.translate.instant('portalDetalhe.errorLoad'));
      this.boloes.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  premiosDoBolao(bolao: PortalBolao) {
    return bolao.cotas.flatMap(cota =>
      cota.premios.map(premio => ({ premio, cotaNumero: cota.numeroSequencial })),
    );
  }

  fmtBrl(n: number): string {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  payStatus(status: string): string {
    return this.translate.instant(`portalCotas.payStatus.${status}`);
  }

  statusLabel(status: string): string {
    return status.replace(/_/g, ' ');
  }
}
