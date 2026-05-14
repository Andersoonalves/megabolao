import {
  Component, signal, computed, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoriaTipo =
  | 'TAXA_ADMINISTRATIVA'
  | 'ACERTOS_EXATOS'
  | 'MAIOR_PONTUACAO_SORTEIO'
  | 'MAIOR_PONTUACAO_GERAL'
  | 'MENOR_PONTUACAO_GERAL';

interface CategoriaForm {
  _id: string;
  nome: string;
  tipo: CategoriaTipo;
  acertosAlvo: number | null;
  sorteioReferencia: number | null;
  percentual: number;
  acumulaSemGanhador: boolean;
}

// Categoria inicial baseada no BOLAO_REF (soma = 100%)
const INITIAL_CATS: CategoriaForm[] = [
  { _id: '1', nome: 'Taxa Administrativa',    tipo: 'TAXA_ADMINISTRATIVA',     acertosAlvo: null, sorteioReferencia: null, percentual: 15, acumulaSemGanhador: false },
  { _id: '2', nome: 'Prêmio Principal',       tipo: 'ACERTOS_EXATOS',          acertosAlvo: 10,   sorteioReferencia: null, percentual: 55, acumulaSemGanhador: false },
  { _id: '3', nome: 'Mais Pontos 1º Sorteio', tipo: 'MAIOR_PONTUACAO_SORTEIO', acertosAlvo: null, sorteioReferencia: 1,    percentual: 10, acumulaSemGanhador: false },
  { _id: '4', nome: '09 Pontos — Mais Pontos',tipo: 'ACERTOS_EXATOS',          acertosAlvo: 9,    sorteioReferencia: null, percentual: 10, acumulaSemGanhador: true  },
  { _id: '5', nome: 'Menos Pontos',           tipo: 'MENOR_PONTUACAO_GERAL',   acertosAlvo: null, sorteioReferencia: null, percentual: 10, acumulaSemGanhador: false },
];

let _nextId = 10;

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-criar-bolao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './criar-bolao.component.html',
})
export class CriarBolaoComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  // ── Form state ───────────────────────────────────────────────────────────────
  nome       = '';
  dataInicio = '';
  valorCota  = 30;

  categorias = signal<CategoriaForm[]>(INITIAL_CATS.map(c => ({ ...c })));
  loading    = signal(false);
  error      = signal('');

  // ── Computed ─────────────────────────────────────────────────────────────────
  soma = computed(() =>
    Math.round(this.categorias().reduce((acc, c) => acc + (c.percentual || 0), 0) * 100) / 100,
  );

  valido = computed(() => this.soma() === 100 && this.errosValidacao().length === 0);

  readonly tipoOptions: CategoriaTipo[] = [
    'TAXA_ADMINISTRATIVA',
    'ACERTOS_EXATOS',
    'MAIOR_PONTUACAO_SORTEIO',
    'MAIOR_PONTUACAO_GERAL',
    'MENOR_PONTUACAO_GERAL',
  ];

  errosValidacao(): string[] {
    const t = this.translate;
    const erros: string[] = [];
    if (this.soma() !== 100) {
      const diff = Math.round((100 - this.soma()) * 100) / 100;
      erros.push(diff > 0
        ? t.instant('criarBolao.errSomaFalta', { diff })
        : t.instant('criarBolao.errSomaExcede', { diff: Math.abs(diff) }));
    }
    for (const cat of this.categorias()) {
      if (cat.tipo === 'ACERTOS_EXATOS' && (!cat.acertosAlvo || cat.acertosAlvo < 1 || cat.acertosAlvo > 10)) {
        erros.push(t.instant('criarBolao.errAcertos', { nome: cat.nome }));
      }
      if (cat.tipo === 'MAIOR_PONTUACAO_SORTEIO' && !cat.sorteioReferencia) {
        erros.push(t.instant('criarBolao.errSorteio', { nome: cat.nome }));
      }
    }
    return erros;
  }

  // ── Template helpers ─────────────────────────────────────────────────────────
  somaMsg(): string {
    const t = this.translate;
    const s = this.soma();
    if (s === 100) return t.instant('criarBolao.somaOk');
    if (s > 100) return t.instant('criarBolao.somaOver', { v: Math.round((s - 100) * 100) / 100 });
    return t.instant('criarBolao.somaUnder', { v: Math.round((100 - s) * 100) / 100 });
  }

  somaBarColor() {
    const s = this.soma();
    if (s === 100) return 'bg-green-50';
    if (s > 100)  return 'bg-red-50';
    return 'bg-amber-50';
  }

  somaTextColor() {
    const s = this.soma();
    if (s === 100) return 'text-green-800';
    if (s > 100)  return 'text-red-700';
    return 'text-amber-700';
  }

  progressColor() {
    const s = this.soma();
    if (s > 100) return 'bg-red-500';
    if (s === 100) return 'bg-green-600';
    return 'bg-amber-400';
  }

  barWidth() {
    return `${Math.min(this.soma(), 100)}%`;
  }

  condicaoTexto(cat: CategoriaForm): string {
    const t = this.translate;
    switch (cat.tipo) {
      case 'TAXA_ADMINISTRATIVA': return t.instant('criarBolao.condTaxa');
      case 'ACERTOS_EXATOS':
        return cat.acertosAlvo
          ? t.instant('criarBolao.condAcertos', { n: cat.acertosAlvo })
          : t.instant('criarBolao.condAcertosPending');
      case 'MAIOR_PONTUACAO_SORTEIO':
        return cat.sorteioReferencia
          ? t.instant('criarBolao.condSorteio', { n: cat.sorteioReferencia })
          : t.instant('criarBolao.condAcertosPending');
      case 'MAIOR_PONTUACAO_GERAL': return t.instant('criarBolao.condMaiorGeral');
      case 'MENOR_PONTUACAO_GERAL': return t.instant('criarBolao.condMenorGeral');
    }
  }

  barColor(tipo: CategoriaTipo, index: number): string {
    if (tipo === 'TAXA_ADMINISTRATIVA') return '#94a3b8';
    if (index === 1) return '#f59e0b';
    return '#059669';
  }

  // ── Mutations ────────────────────────────────────────────────────────────────
  update<K extends keyof CategoriaForm>(i: number, field: K, value: CategoriaForm[K]): void {
    this.categorias.update(cats =>
      cats.map((c, idx) => idx === i ? { ...c, [field]: value } : c),
    );
  }

  onTipoChange(i: number, tipo: CategoriaTipo): void {
    this.categorias.update(cats =>
      cats.map((c, idx) => idx === i
        ? { ...c, tipo, acertosAlvo: null, sorteioReferencia: null }
        : c
      ),
    );
  }

  addCategoria(): void {
    const id = String(++_nextId);
    this.categorias.update(cats => [...cats, {
      _id: id, nome: this.translate.instant('criarBolao.newCategoryName'), tipo: 'ACERTOS_EXATOS',
      acertosAlvo: null, sorteioReferencia: null, percentual: 0, acumulaSemGanhador: false,
    }]);
  }

  removeCategoria(i: number): void {
    this.categorias.update(cats => cats.filter((_, idx) => idx !== i));
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    if (!this.valido() || this.loading()) return;

    this.loading.set(true);
    this.error.set('');

    try {
      await firstValueFrom(
        this.api.post('/boloes', {
          nome: this.nome,
          valorCota: this.valorCota,
          dataInicio: this.dataInicio || undefined,
          categorias: this.categorias().map((c, i) => ({
            nome: c.nome,
            tipo: c.tipo,
            ...(c.acertosAlvo    !== null && { acertosAlvo: c.acertosAlvo }),
            ...(c.sorteioReferencia !== null && { sorteioReferencia: c.sorteioReferencia }),
            percentual: c.percentual,
            acumulaSemGanhador: c.acumulaSemGanhador,
            ordem: i + 1,
          })),
        }),
      );
      await this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('errors.createPool');
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
