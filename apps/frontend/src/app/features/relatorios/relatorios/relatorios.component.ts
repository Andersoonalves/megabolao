import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

@Component({
  selector: 'nb-relatorios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, TranslatePipe],
  templateUrl: './relatorios.component.html',
})
export class RelatoriosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  // ── Bolão selector ────────────────────────────────────────────
  boloes = signal<{ id: string; nome: string; status: string }[]>([]);
  selectedBolaoId = signal('');
  loading = signal(false);
  error = signal('');

  // ── Dashboard data ────────────────────────────────────────────
  dash = signal<{
    bolao: { nome: string; status: string; valorCota: number; categorias: number };
    totalPago: number;
    totalPendente: number;
    valorBruto: number;
    categorias: {
      id: string; ordem: number; nome: string; tipo: string;
      acertosAlvo: number | null; percentual: number; acumulaSemGanhador: boolean;
      valorAcumuladoAnterior: number;
    }[];
    sorteios: { numeroConcurso: number; dataSorteio: string; bolasSorteadas: number[]; sequenciaNoBolao: number }[];
    ranking: { posicao: number; numeroSequencial: number; nomeIdentificacao: string; totalAcertosAcumulados: number; statusResultado: string }[];
    distribuicaoAcertos: { acertos: number; quantidade: number }[];
  } | null>(null);

  // ── Report generation ─────────────────────────────────────────
  gerandoXlsx = signal(false);
  gerandoPdf  = signal(false);
  urlXlsx     = signal('');
  urlPdf      = signal('');
  reportError = signal('');

  // ── Computed KPIs ─────────────────────────────────────────────
  totalPago = computed(() => this.dash()?.totalPago ?? 0);
  totalPendente = computed(() => this.dash()?.totalPendente ?? 0);
  valorBruto = computed(() => this.dash()?.valorBruto ?? 0);
  valorCota = computed(() => this.dash()?.bolao?.valorCota ?? 0);
  valorPendente = computed(() => this.totalPendente() * this.valorCota());

  taxaPercentual = computed(() => {
    const cats = this.dash()?.categorias ?? [];
    const taxa = cats.find(c => c.tipo === 'TAXA_ADMINISTRATIVA');
    return taxa?.percentual ?? 0;
  });

  taxaValor = computed(() => {
    const vb = this.valorBruto();
    const pct = this.taxaPercentual();
    return vb > 0 ? (pct / 100) * vb : 0;
  });

  premiosDistribuidos = computed(() => {
    const cats = this.dash()?.categorias ?? [];
    const vb = this.valorBruto();
    return cats
      .filter(c => c.tipo !== 'TAXA_ADMINISTRATIVA')
      .map(c => ({
        nome: c.nome,
        percentual: c.percentual,
        valor: (c.percentual / 100) * vb + (c.valorAcumuladoAnterior ?? 0),
        color: this.catColor(c.tipo),
      }));
  });

  rankingRows = computed(() => {
    const r = this.dash()?.ranking ?? [];
    const vb = this.valorBruto();
    const cats = this.dash()?.categorias ?? [];
    return r.map(item => {
      const premio = this.calcPremio(item.totalAcertosAcumulados, cats, vb);
      return {
        posicao: item.posicao,
        nome: item.nomeIdentificacao,
        cota: item.numeroSequencial,
        acertos: item.totalAcertosAcumulados,
        categoria: this.bestCategoria(item.totalAcertosAcumulados, cats),
        premio,
        resultado: item.statusResultado,
      };
    });
  });

  sorteiosBars = computed(() => {
    const s = this.dash()?.sorteios ?? [];
    return s.map(sv => ({
      concurso: sv.numeroConcurso,
      data: sv.dataSorteio,
      bolas: sv.bolasSorteadas,
      seq: sv.sequenciaNoBolao,
    }));
  });

  distribuicao = computed(() => {
    const d = this.dash()?.distribuicaoAcertos ?? [];
    const total = Math.max(d.reduce((a, x) => a + x.quantidade, 0), 1);
    return d.map(x => ({
      acertos: x.acertos,
      quantidade: x.quantidade,
      percento: Math.round((x.quantidade / total) * 100),
    }));
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    void this.loadBoloes();
  }

  private async loadBoloes(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.api.get<{ data: { id: string; nome: string; status: string }[] }>('/boloes?perPage=100'),
      );
      this.boloes.set(res.data ?? []);
      if (res.data?.length > 0) {
        this.selectedBolaoId.set(res.data[0].id);
        await this.loadDashboard();
      }
    } catch {
      this.error.set(this.translate.instant('relatorios.errLoadBoloes'));
    }
  }

  async onBolaoChange(bolaoId: string): Promise<void> {
    this.selectedBolaoId.set(bolaoId);
    this.urlXlsx.set('');
    this.urlPdf.set('');
    this.reportError.set('');
    await this.loadDashboard();
  }

  private async loadDashboard(): Promise<void> {
    const id = this.selectedBolaoId();
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.api.get(`/boloes/${id}/dashboard`));
      this.dash.set(data as any);
    } catch {
      this.error.set(this.translate.instant('relatorios.errLoadDashboard'));
      this.dash.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Report generation ─────────────────────────────────────────
  async gerarXlsx(): Promise<void> {
    const id = this.selectedBolaoId();
    if (!id) return;
    this.gerandoXlsx.set(true);
    this.reportError.set('');
    try {
      const res = await firstValueFrom(this.api.post<{ url: string }>(`/boloes/${id}/relatorios/xlsx`, {}));
      this.urlXlsx.set(res.url);
      window.open(res.url, '_blank');
    } catch { this.reportError.set(this.translate.instant('relatorios.errXlsx')); }
    finally { this.gerandoXlsx.set(false); }
  }

  async gerarPdf(): Promise<void> {
    const id = this.selectedBolaoId();
    if (!id) return;
    this.gerandoPdf.set(true);
    this.reportError.set('');
    try {
      const res = await firstValueFrom(this.api.post<{ url: string }>(`/boloes/${id}/relatorios/pdf`, {}));
      this.urlPdf.set(res.url);
      window.open(res.url, '_blank');
    } catch { this.reportError.set(this.translate.instant('relatorios.errPdf')); }
    finally { this.gerandoPdf.set(false); }
  }

  // ── Helpers ───────────────────────────────────────────────────
  private catColor(tipo: string): string {
    const map: Record<string, string> = {
      TAXA_ADMINISTRATIVA: '#f1f5f9',
      ACERTOS_EXATOS: '#10b981',
      MAIOR_PONTUACAO_SORTEIO: '#3b82f6',
      MAIOR_PONTUACAO_GERAL: '#f59e0b',
      MENOR_PONTUACAO_GERAL: '#ef4444',
    };
    return map[tipo] ?? '#94a3b8';
  }

  private bestCategoria(acertos: number, cats: { nome: string; tipo: string; acertosAlvo: number | null }[]): string {
    const exact = cats
      .filter(c => c.tipo === 'ACERTOS_EXATOS' && c.acertosAlvo === acertos)
      .sort((a, b) => (b.acertosAlvo ?? 0) - (a.acertosAlvo ?? 0));
    if (exact.length > 0) return exact[0].nome;
    if (acertos >= 7) return `${acertos} acertos`;
    return '-';
  }

  private calcPremio(acertos: number, cats: { tipo: string; acertosAlvo: number | null; percentual: number }[], vb: number): number {
    const match = cats.find(c => c.tipo === 'ACERTOS_EXATOS' && c.acertosAlvo === acertos);
    if (match) return (match.percentual / 100) * vb;
    return 0;
  }

  fmtBrl(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }

  fmtDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch { return iso; }
  }

  statusLabel(s: string): string {
    const k = `relatorios.status.${s}`;
    const t = this.translate.instant(k);
    return t !== k ? t : s;
  }
}
