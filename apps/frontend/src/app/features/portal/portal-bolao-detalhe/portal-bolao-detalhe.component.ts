import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PortalApiService, PortalBolao, PortalRankingItem, PortalSorteio } from '../portal-api.service';

@Component({
  selector: 'nb-portal-bolao-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './portal-bolao-detalhe.component.html',
})
export class PortalBolaoDetalheComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly portalApi = inject(PortalApiService);
  private readonly translate = inject(TranslateService);

  readonly bolao = signal<PortalBolao | null>(null);
  readonly ranking = signal<PortalRankingItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notFound = signal(false);
  readonly rankingError = signal('');
  readonly shareCopied = signal(false);
  readonly activeTab   = signal<'cotas' | 'ranking' | 'sorteios'>('cotas');
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  readonly allDrawn = computed(() =>
    this.sorteiosProcessados().flatMap((s: PortalSorteio) => s.bolasSorteadas),
  );

  readonly sorteiosProcessados = computed(() => {
    const b = this.bolao();
    if (!b) return [];
    return b.sorteios.filter(s => s.processado);
  });

  private readonly minhaCotaIds = computed(() => new Set(this.bolao()?.cotas.map(c => c.id) ?? []));

  /** Acertos client-side de uma cota própria (pela lista de palpites). */
  acertosDaCota(cotaId: string): number {
    const cota = this.bolao()?.cotas.find(c => c.id === cotaId);
    if (!cota) return 0;
    return this.acertosAcumulados(cota);
  }

  /** Retorna o acertos correto: client-side p/ cotas próprias, backend p/ outras. */
  acertosRanking(r: PortalRankingItem): number {
    return this.minhaCotaIds().has(r.cotaId)
      ? this.acertosDaCota(r.cotaId)
      : r.totalAcertosAcumulados;
  }

  /** Cotas próprias com posição e acertos calculados, para exibir no topo do ranking. */
  minhasCotasRanking = computed(() => {
    const cotas = this.bolao()?.cotas ?? [];
    return cotas.map(c => {
      const acertos = this.acertosAcumulados(c);
      const rankItem = this.ranking().find(r => r.cotaId === c.id);
      return { cota: c, acertos, posicao: rankItem?.posicao ?? null, maxPalpites: c.palpites.length };
    });
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(pm => {
      const id = pm.get('bolaoId');
      if (id) void this.load(id);
    });
  }

  private async load(bolaoId: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.notFound.set(false);
    this.rankingError.set('');
    this.bolao.set(null);
    this.ranking.set([]);

    try {
      const resumo = await this.portalApi.resumo();
      const b = resumo.boloes.find(x => x.id === bolaoId) ?? null;
      if (!b) {
        this.notFound.set(true);
        return;
      }
      this.bolao.set(b);
      try {
        const rank = await this.portalApi.ranking(bolaoId);
        this.ranking.set(rank);
      } catch {
        this.rankingError.set(this.translate.instant('portalRanking.errorLoad'));
        this.ranking.set([]);
      }
    } catch {
      this.error.set(this.translate.instant('portalBolaoDetalhe.errorLoad'));
    } finally {
      this.loading.set(false);
    }
  }

  rankingRowClass(r: PortalRankingItem): string {
    const parts: string[] = [];
    if (r.posicao <= 3) parts.push('bg-amber-50/50');
    if (this.minhaCotaIds().has(r.cotaId)) parts.push('ring-1 ring-inset ring-green-600/25');
    return parts.join(' ');
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** Acertos de uma cota em um sorteio específico. */
  acertosNoSorteio(palpites: number[], bolasSorteadas: number[]): number {
    const set = new Set(bolasSorteadas);
    return palpites.filter(n => set.has(n)).length;
  }

  /** Acertos acumulados calculados client-side: soma de hits por sorteio. */
  acertosAcumulados(cota: { palpites: number[] }): number {
    return this.sorteiosProcessados().reduce((sum, s) => {
      const set = new Set(s.bolasSorteadas);
      return sum + cota.palpites.filter(n => set.has(n)).length;
    }, 0);
  }

  bolaClass(n: number, allDrawn: number[]): string {
    if (allDrawn.length === 0) return 'bg-white text-slate-700 border-slate-200';
    return allDrawn.includes(n)
      ? 'bg-amber-400 text-white border-amber-400 shadow-sm'
      : 'bg-white text-slate-300 border-slate-100';
  }

  resultadoBadgeClass(status: string): string {
    if (status === 'PREMIADO') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'NAO_PREMIADO') return 'bg-slate-100 text-slate-500 border-slate-200';
    return 'bg-blue-50 text-blue-600 border-blue-200';
  }

  fmtDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      return iso;
    }
  }

  statusLabel(status: string): string {
    return status.replace(/_/g, ' ');
  }

  async copyWhatsappLink(): Promise<void> {
    const url = this.bolao()?.linkWhatsappOrganizador;
    if (!url) return;
    if (this.copyFeedbackTimer) {
      clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.shareCopied.set(true);
      this.copyFeedbackTimer = setTimeout(() => {
        this.shareCopied.set(false);
        this.copyFeedbackTimer = null;
      }, 2500);
    } catch {
      this.fallbackCopyToClipboard(url);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.shareCopied.set(true);
      this.copyFeedbackTimer = setTimeout(() => {
        this.shareCopied.set(false);
        this.copyFeedbackTimer = null;
      }, 2500);
    } catch {
      /* ignore */
    }
  }

  openWhatsapp(): void {
    const url = this.bolao()?.linkWhatsappOrganizador;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
}
