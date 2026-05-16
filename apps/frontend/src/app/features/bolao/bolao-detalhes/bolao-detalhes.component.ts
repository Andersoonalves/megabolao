import { Component, signal, input, OnInit, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { BolasGridComponent } from '../../../shared/components/bolas-grid/bolas-grid.component';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

type CategoriaTipo =
  | 'TAXA_ADMINISTRATIVA'
  | 'ACERTOS_EXATOS'
  | 'MAIOR_PONTUACAO_SORTEIO'
  | 'MAIOR_PONTUACAO_GERAL'
  | 'MENOR_PONTUACAO_GERAL';

interface CategoriaItem {
  id: string;
  ordem: number;
  nome: string;
  tipo: CategoriaTipo;
  acertosAlvo: number | null;
  sorteioReferencia: number | null;
  percentual: number;
  acumulaSemGanhador: boolean;
  valorAcumuladoAnterior: number;
}

interface DashboardData {
  bolao: { nome: string; status: string; valorCota: number; dataInicio: string | null; dataTermino: string | null; categorias: number };
  totalPago: number;
  totalPendente: number;
  valorBruto: number;
  categorias: CategoriaItem[];
  sorteios: { numeroConcurso: number; dataSorteio: string; bolasSorteadas: number[]; sequenciaNoBolao: number }[];
  bolasJaSorteadas: number[];
  ranking: { posicao: number; numeroSequencial: number; nomeIdentificacao: string; totalAcertosAcumulados: number; statusResultado: string }[];
  distribuicaoAcertos: { acertos: number; quantidade: number }[];
}

const TIPO_CHIP: Record<CategoriaTipo, string> = {
  TAXA_ADMINISTRATIVA:     'bg-slate-100 text-slate-700',
  ACERTOS_EXATOS:          'bg-green-50 text-green-800',
  MAIOR_PONTUACAO_SORTEIO: 'bg-blue-50 text-blue-700',
  MAIOR_PONTUACAO_GERAL:   'bg-amber-50 text-amber-600',
  MENOR_PONTUACAO_GERAL:   'bg-red-50 text-red-700',
};

@Component({
  selector: 'nb-bolao-detalhes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, DecimalPipe, CurrencyPipe, DatePipe, BolasGridComponent, BadgeComponent, TranslatePipe],
  templateUrl: './bolao-detalhes.component.html',
})
export class BolaoDetalhesComponent implements OnInit {
  readonly id  = input<string>('');
  private readonly api       = inject(ApiService);
  private readonly router    = inject(Router);
  private readonly translate = inject(TranslateService);

  loading      = signal(true);
  error        = signal('');
  data         = signal<DashboardData | null>(null);
  loadingClone = signal(false);

  confirmandoExclusao = signal(false);
  deletando           = signal(false);
  deleteError         = signal('');

  podeDeletar(): boolean {
    const s = this.data()?.bolao.status;
    return s === 'A_SER_INICIADO' || s === 'SUSPENSO';
  }

  readonly acertosRange = [0,1,2,3,4,5,6,7,8,9,10];

  constructor() {
    effect(() => { if (this.id()) this.load(); });
  }

  ngOnInit(): void {}

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await firstValueFrom(this.api.get<DashboardData>(`/boloes/${this.id()}/dashboard`));
      this.data.set(d);
    } catch {
      this.error.set(this.translate.instant('errors.loadDetails'));
    } finally {
      this.loading.set(false);
    }
  }

  async clonar(): Promise<void> {
    this.loadingClone.set(true);
    this.error.set('');
    try {
      const clonado = await firstValueFrom(
        this.api.post<{ id: string }>(`/boloes/${this.id()}/clonar`, {}),
      );
      await this.router.navigate(['/bolao', clonado.id, 'detalhes']);
    } catch {
      this.error.set(this.translate.instant('errors.cloneFailed'));
    } finally {
      this.loadingClone.set(false);
    }
  }

  async excluir(): Promise<void> {
    if (this.deletando()) return;
    this.deletando.set(true);
    this.deleteError.set('');
    try {
      await firstValueFrom(this.api.delete(`/boloes/${this.id()}`));
      await this.router.navigate(['/boloes']);
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.deleteError.set(e.error?.message ?? this.translate.instant('errors.deleteFailed'));
      this.deletando.set(false);
    }
  }

  qtd(d: DashboardData, acc: number): number { return d.distribuicaoAcertos.find(x => x.acertos === acc)?.quantidade ?? 0; }
  barH(d: DashboardData, acc: number): number { const max = Math.max(...d.distribuicaoAcertos.map(x => x.quantidade), 1); return (this.qtd(d, acc) / max) * 100; }
  firstName(nome: string): string { return nome.split(' ').slice(0, 2).join(' '); }
  pad(n: number): string { return String(n).padStart(2, '0'); }
  tipoLabel(t: CategoriaTipo): string {
    return this.translate.instant(`bolaoDetalhes.tipo.${t}`);
  }
  chipClass(t: CategoriaTipo): string { return TIPO_CHIP[t]; }

  /**
   * Texto adicional por tipo: alvo de acertos, sorteio de referência, etc.
   * Retorna string vazia quando o tipo não tem detalhe específico.
   */
  categoriaDetalhe(c: CategoriaItem): string {
    const t = this.translate;
    switch (c.tipo) {
      case 'ACERTOS_EXATOS':
        return c.acertosAlvo != null ? t.instant('bolaoDetalhes.catDetalhe.acertos', { n: c.acertosAlvo }) : '';
      case 'MAIOR_PONTUACAO_SORTEIO':
        return c.sorteioReferencia != null ? t.instant('bolaoDetalhes.catDetalhe.sorteio', { n: c.sorteioReferencia }) : '';
      case 'MAIOR_PONTUACAO_GERAL':
        return t.instant('bolaoDetalhes.catDetalhe.maiorGeral');
      case 'MENOR_PONTUACAO_GERAL':
        return t.instant('bolaoDetalhes.catDetalhe.menorGeral');
      case 'TAXA_ADMINISTRATIVA':
        return t.instant('bolaoDetalhes.catDetalhe.taxa');
      default:
        return '';
    }
  }

  valorEstimado(c: CategoriaItem, valorBruto: number): number {
    return (c.percentual / 100) * valorBruto + (c.valorAcumuladoAnterior ?? 0);
  }

  totalPercentual(cats: CategoriaItem[]): number {
    return cats.reduce((acc, c) => acc + c.percentual, 0);
  }
}
