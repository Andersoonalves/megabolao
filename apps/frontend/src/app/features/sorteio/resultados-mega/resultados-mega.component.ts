import {
  Component, computed, signal, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  formatarProximoSorteioDataCurta,
  formatarProximoSorteioDiaHora,
  parseDataMegaBr,
  resolverProximoSorteioMega,
} from '@nossobolao/shared-utils';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { MegaSenaAlertComponent } from '../../../shared/components/mega-sena-alert/mega-sena-alert.component';

interface MegaSenaAplicacaoBolao {
  sorteioId: string;
  bolaoId: string;
  bolaoNome: string;
  sequenciaNoBolao: number;
}

interface MegaSenaPainelItem {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  ganhadoresSena: number;
  acumulado: boolean;
  valorArrecadado: number | null;
  estimativaProximoConcurso: number | null;
  dataProximoConcurso: string | null;
  numeroConcursoProximo: number | null;
  aplicacoes: MegaSenaAplicacaoBolao[];
}

interface MegaSenaPainelResponse {
  consultadoEm: string;
  bolaoAtivoNome: string | null;
  resumo: { aplicadosNoPeriodo: number; totalNoPeriodo: number };
  proximo: { numero: number | null; data: string | null };
  itens: MegaSenaPainelItem[];
}

@Component({
  selector: 'nb-resultados-mega',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, MegaSenaAlertComponent, TranslatePipe, FormsModule],
  templateUrl: './resultados-mega.component.html',
})
export class ResultadosMegaComponent implements OnInit {
  private readonly api        = inject(ApiService);
  private readonly translate = inject(TranslateService);

  loading = signal(false);
  error   = signal('');
  painel  = signal<MegaSenaPainelResponse | null>(null);

  busca         = signal('');
  filtroStatus  = signal<'todos' | 'aplicados' | 'pendentes'>('todos');
  aplicandoId   = signal<'hero' | null>(null);
  aplicandoLinha = signal<number | null>(null);

  readonly skeleton4 = [0, 1, 2, 3];

  ultimo = computed(() => this.painel()?.itens[0] ?? null);

  tabelaBase = computed(() => {
    const p = this.painel();
    if (!p?.itens.length) return [];
    return p.itens.slice(1);
  });

  tabelaFiltrada = computed(() => {
    let rows = [...this.tabelaBase()];
    const st = this.filtroStatus();
    if (st === 'aplicados') rows = rows.filter((r) => r.aplicacoes.length > 0);
    else if (st === 'pendentes') rows = rows.filter((r) => r.aplicacoes.length === 0);

    const q = this.busca().trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const dataFmt = this.fmtDataCurta(r.dataSorteio).toLowerCase();
        return String(r.numeroConcurso).includes(q)
          || r.dataSorteio.toLowerCase().includes(q)
          || dataFmt.includes(q);
      });
    }
    return rows;
  });

  ngOnInit(): void { void this.carregar(); }

  async carregar(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.api.get<MegaSenaPainelResponse>('/sorteios/mega-sena?painel=1&ultimos=20'),
      );
      this.painel.set(res);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message
        ?? this.translate.instant('megaSenaPainel.empty');
      this.error.set(msg);
      this.painel.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  rotuloAplicarHero(p: MegaSenaPainelResponse): string {
    const u = p.itens[0];
    if (u?.aplicacoes.length) return this.translate.instant('megaSenaPainel.heroJaAplicado');
    const nome = p.bolaoAtivoNome;
    if (nome) return this.translate.instant('megaSenaPainel.heroAplicarNome', { nome });
    return this.translate.instant('megaSenaPainel.heroAplicar');
  }

  async aplicarConcurso(row: MegaSenaPainelItem, destaque = false): Promise<void> {
    if (destaque) this.aplicandoId.set('hero');
    else this.aplicandoLinha.set(row.numeroConcurso);
    this.error.set('');
    try {
      await firstValueFrom(this.api.post('/sorteios', {
        numeroConcurso: row.numeroConcurso,
        dataSorteio:    row.dataSorteio,
        bolasSorteadas: row.bolasSorteadas,
      }));
      await this.carregar();
    } catch {
      this.error.set(this.translate.instant('megaSenaPainel.errAplicar'));
    } finally {
      this.aplicandoId.set(null);
      this.aplicandoLinha.set(null);
    }
  }

  exportarCsv(): void {
    const rows = this.tabelaFiltrada();
    const sep = ';';
    const h = [
      this.translate.instant('megaSenaPainel.colConcurso'),
      this.translate.instant('megaSenaPainel.colData'),
      this.translate.instant('megaSenaPainel.colDezenas'),
      this.translate.instant('megaSenaPainel.colGanhadores'),
      this.translate.instant('megaSenaPainel.colPremio'),
      this.translate.instant('megaSenaPainel.colAplicado'),
    ].join(sep);
    const body = rows.map((r) => {
      const dez = r.bolasSorteadas.map((n) => this.pad(n)).join(' ');
      const ganh = r.ganhadoresSena === 0
        ? this.translate.instant('megaSenaPainel.badgeAcumulou')
        : String(r.ganhadoresSena);
      const prem = this.fmtMoedaCsv(r.valorArrecadado);
      const apl = r.aplicacoes.map((a) => `${a.bolaoNome} #${a.sequenciaNoBolao}`).join(' | ');
      return [
        r.numeroConcurso,
        r.dataSorteio,
        dez,
        ganh,
        prem,
        apl || '—',
      ].join(sep);
    }).join('\n');
    const blob = new Blob([`${h}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mega-sena-sortearios.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  urlCaixa(numeroConcurso: number): string {
    return `https://loterias.caixa.gov.br/pesquisa/resultados/mega-sena/${numeroConcurso}`;
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }

  relConsultado(iso: string): string {
    const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
    if (min < 1) return this.translate.instant('megaSenaPainel.consultadoAgora');
    if (min < 60) return this.translate.instant('megaSenaPainel.consultadoMin', { n: min });
    const h = Math.floor(min / 60);
    return this.translate.instant('megaSenaPainel.consultadoHora', { n: h });
  }

  fmtDataCurta(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString(loc, {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch { return iso; }
  }

  fmtDiaSemana(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' }).replace(/\./g, '').trim();
    } catch { return ''; }
  }

  fmtDataTitulo(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try {
      const d = new Date(`${iso}T12:00:00`);
      if (loc === 'en-US') {
        const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
        const rest = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
        return `${rest} (${wd})`;
      }
      const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      const dd = String(d.getDate()).padStart(2, '0');
      const mon = months[d.getMonth()] ?? '';
      const yyyy = d.getFullYear();
      const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace(/\./g, '').trim();
      return `${dd}/${mon}/${yyyy} (${wd})`;
    } catch { return iso; }
  }

  fmtProximoData(br: string | null): string {
    if (!br) return this.translate.instant('megaSenaPainel.proximoDiaUnknown');
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    const instante = parseDataMegaBr(br) ?? resolverProximoSorteioMega({ dataOficialBr: br });
    return formatarProximoSorteioDataCurta(instante, loc);
  }

  fmtProximoExtra(br: string | null): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    const instante = br
      ? (parseDataMegaBr(br) ?? resolverProximoSorteioMega({ dataOficialBr: br }))
      : resolverProximoSorteioMega();
    return formatarProximoSorteioDiaHora(instante, loc);
  }

  fmtMoedaResumida(n: number | null): string {
    if (n === null || !Number.isFinite(n)) return '—';
    if (n >= 1_000_000) {
      const v = (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
      return `R$ ${v} mi`;
    }
    const v = (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    return `R$ ${v} mil`;
  }

  fmtMoedaCsv(n: number | null): string {
    if (n === null || !Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
