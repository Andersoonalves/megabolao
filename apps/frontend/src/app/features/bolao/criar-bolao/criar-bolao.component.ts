import {
  Component, signal, computed, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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

const TIPO_LABELS: Record<CategoriaTipo, string> = {
  TAXA_ADMINISTRATIVA:      'Taxa adm.',
  ACERTOS_EXATOS:           'Acertos exatos',
  MAIOR_PONTUACAO_SORTEIO:  'Maior pont. sorteio',
  MAIOR_PONTUACAO_GERAL:    'Maior pont. geral',
  MENOR_PONTUACAO_GERAL:    'Menor pont. geral',
};

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
  imports: [BackButtonComponent, FormsModule, RouterLink],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Bolão CG</span>
        <span class="text-slate-300">›</span>
        <span class="text-slate-400">Bolões</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Criar</span>
      </div>
      <div class="flex gap-2">
        <a routerLink="/dashboard"
           class="inline-flex items-center px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-700 transition-colors">
          Cancelar
        </a>
        <button (click)="submit()" [disabled]="!valido() || loading()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm">
          ✓ {{ loading() ? 'Criando...' : 'Criar bolão' }}
        </button>
      </div>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-6">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">Novo bolão</h1>
        <p class="text-slate-500 text-[13.5px]">Defina dados do bolão e as categorias. Após criado, as categorias são imutáveis.</p>
      </div>

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <span>⚠</span> {{ error() }}
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

        <!-- Left column -->
        <div class="flex flex-col gap-5">

          <!-- Card 1: Dados do bolão -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">1. Dados do bolão</h3>
            </div>
            <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Nome do bolão</label>
                <input [(ngModel)]="nome" name="nome"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                       placeholder="Ex: Bolão Mega 2995" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Data de início prevista</label>
                <input [(ngModel)]="dataInicio" name="dataInicio" type="date"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">Valor da cota (R$)</label>
                <input [(ngModel)]="valorCota" name="valorCota" type="number" min="0.01" step="0.01" inputmode="decimal"
                       class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700 tabular" />
              </div>
            </div>
          </div>

          <!-- Card 2: Categorias -->
          <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h3 class="font-display font-semibold text-[15px]">2. Categorias de premiação</h3>
                <p class="text-slate-400 text-xs mt-0.5">Defina N categorias livres. A soma deve fechar exatamente 100%.</p>
              </div>
              <button (click)="addCategoria()"
                      class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] text-slate-700 transition-colors flex-shrink-0">
                + Categoria
              </button>
            </div>

            <!-- Table — scroll horizontal no mobile -->
            <div class="overflow-x-auto -mx-0">
              <table class="w-full text-[13px]">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="w-8 px-3 py-2.5"></th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5 min-w-[160px]">Nome</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5 min-w-[150px]">Tipo</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5 min-w-[140px]">Condição</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5 w-[100px]">Percentual</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-3 py-2.5 w-[80px]">Acumula</th>
                    <th class="w-8 px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (cat of categorias(); track cat._id; let i = $index) {
                    <tr class="border-b border-slate-100 last:border-0">
                      <td class="px-3 py-2 text-slate-300 cursor-grab text-center">⋮⋮</td>

                      <!-- Nome -->
                      <td class="px-2 py-2">
                        <input [value]="cat.nome"
                               (input)="update(i, 'nome', $any($event.target).value)"
                               class="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[12.5px] focus:outline-none focus:border-green-700" />
                      </td>

                      <!-- Tipo -->
                      <td class="px-2 py-2">
                        <select [value]="cat.tipo"
                                (change)="onTipoChange(i, $any($event.target).value)"
                                class="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[11.5px] focus:outline-none focus:border-green-700 bg-white">
                          @for (tipo of tipoOptions; track tipo.value) {
                            <option [value]="tipo.value">{{ tipo.label }}</option>
                          }
                        </select>
                      </td>

                      <!-- Condição -->
                      <td class="px-2 py-2">
                        @if (cat.tipo === 'ACERTOS_EXATOS') {
                          <div class="flex items-center gap-1.5">
                            <input [value]="cat.acertosAlvo ?? ''"
                                   (input)="update(i, 'acertosAlvo', +$any($event.target).value || null)"
                                   type="number" min="1" max="10" inputmode="numeric"
                                   class="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-[12.5px] text-center focus:outline-none focus:border-green-700 tabular" />
                            <span class="text-slate-400 text-xs whitespace-nowrap">acertos</span>
                          </div>
                        } @else if (cat.tipo === 'MAIOR_PONTUACAO_SORTEIO') {
                          <div class="flex items-center gap-1.5">
                            <input [value]="cat.sorteioReferencia ?? ''"
                                   (input)="update(i, 'sorteioReferencia', +$any($event.target).value || null)"
                                   type="number" min="1" inputmode="numeric"
                                   class="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-[12.5px] text-center focus:outline-none focus:border-green-700 tabular" />
                            <span class="text-slate-400 text-xs whitespace-nowrap">º sorteio</span>
                          </div>
                        } @else {
                          <span class="text-slate-400 text-[12px]">{{ condicaoTexto(cat) }}</span>
                        }
                      </td>

                      <!-- Percentual -->
                      <td class="px-2 py-2">
                        <div class="relative">
                          <input [value]="cat.percentual"
                                 (input)="update(i, 'percentual', +$any($event.target).value || 0)"
                                 type="number" min="0" max="100" step="0.01" inputmode="decimal"
                                 class="w-full pl-2 pr-6 py-1.5 border border-slate-200 rounded-lg text-[12.5px] text-right focus:outline-none focus:border-green-700 tabular" />
                          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]">%</span>
                        </div>
                      </td>

                      <!-- Acumula -->
                      <td class="px-2 py-2 text-center">
                        <label class="inline-flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer">
                          <input [checked]="cat.acumulaSemGanhador"
                                 (change)="update(i, 'acumulaSemGanhador', $any($event.target).checked)"
                                 type="checkbox"
                                 class="accent-green-700 w-3.5 h-3.5" />
                          Sim
                        </label>
                      </td>

                      <!-- Delete -->
                      <td class="px-2 py-2 text-center">
                        <button (click)="removeCategoria(i)"
                                class="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors text-sm">
                          ✕
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Soma footer -->
            <div class="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between"
                 [class]="somaBarColor()">
              <div>
                <div class="text-sm font-semibold" [class]="somaTextColor()">
                  {{ somaMsg() }}
                </div>
                <div class="text-slate-400 text-[11.5px] mt-0.5">
                  {{ categorias().length }} categorias · validação em tempo real
                </div>
              </div>
              <div class="flex items-center gap-3">
                <!-- Progress bar -->
                <div class="w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-200"
                       [style.width]="barWidth()"
                       [class]="progressColor()"></div>
                </div>
                <!-- Total -->
                <div class="font-display tabular text-[22px] font-bold min-w-[56px] text-right" [class]="somaTextColor()">
                  {{ soma() }}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: sticky sidebar -->
        <aside class="flex flex-col gap-4" style="position: sticky; top: 72px; align-self: start">

          <!-- Preview -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">Pré-visualização</h3>
            </div>
            <div class="p-4 flex flex-col gap-2.5">
              @for (cat of categorias(); track cat._id; let i = $index) {
                <div class="flex items-center gap-2 text-[12.5px]">
                  <div class="w-1.5 h-6 rounded-sm flex-shrink-0"
                       [style.background]="barColor(cat.tipo, i)"></div>
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold truncate">{{ cat.nome || '(sem nome)' }}</div>
                    <div class="text-slate-400 text-[11px]">{{ condicaoTexto(cat) }}</div>
                  </div>
                  <div class="font-mono font-semibold text-[12px] tabular">{{ cat.percentual }}%</div>
                </div>
              }
              @if (categorias().length === 0) {
                <div class="text-slate-400 text-xs text-center py-4">Nenhuma categoria adicionada</div>
              }
            </div>
          </div>

          <!-- Aviso imutabilidade -->
          <div class="p-3.5 bg-green-50 border border-green-200 rounded-lg flex gap-2.5">
            <span class="text-green-700 flex-shrink-0 text-sm mt-0.5">✦</span>
            <p class="text-[12px] text-green-900 leading-relaxed">
              <strong>Após criação, categorias são imutáveis.</strong> Apenas o Master pode alterar em casos excepcionais.
            </p>
          </div>

          <!-- Validação detalhada -->
          @if (!valido() && categorias().length > 0) {
            <div class="p-3.5 bg-amber-50 border border-amber-100 rounded-lg flex gap-2.5">
              <span class="text-amber-600 flex-shrink-0 text-sm mt-0.5">⚠</span>
              <div class="text-[12px] text-amber-800 leading-relaxed flex flex-col gap-1">
                @for (err of errosValidacao(); track err) {
                  <div>{{ err }}</div>
                }
              </div>
            </div>
          }
        </aside>
      </div>
    </div>
  `,
})
export class CriarBolaoComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

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

  errosValidacao = computed(() => {
    const erros: string[] = [];
    if (this.soma() !== 100) {
      const diff = Math.round((100 - this.soma()) * 100) / 100;
      erros.push(diff > 0 ? `Faltam ${diff}% para fechar 100%` : `Soma excedida em ${-diff}%`);
    }
    for (const cat of this.categorias()) {
      if (cat.tipo === 'ACERTOS_EXATOS' && (!cat.acertosAlvo || cat.acertosAlvo < 1 || cat.acertosAlvo > 10)) {
        erros.push(`"${cat.nome}": acertosAlvo deve ser 1–10`);
      }
      if (cat.tipo === 'MAIOR_PONTUACAO_SORTEIO' && !cat.sorteioReferencia) {
        erros.push(`"${cat.nome}": informe o número do sorteio de referência`);
      }
    }
    return erros;
  });

  // ── Template helpers ─────────────────────────────────────────────────────────
  readonly tipoOptions = Object.entries(TIPO_LABELS).map(([value, label]) => ({ value, label }));

  somaMsg() {
    const s = this.soma();
    if (s === 100) return '✓ Soma fechada — bolão pronto para criação';
    if (s > 100)  return `Soma excedida em ${Math.round((s - 100) * 100) / 100}%`;
    return `Faltam ${Math.round((100 - s) * 100) / 100}% para fechar 100%`;
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
    switch (cat.tipo) {
      case 'TAXA_ADMINISTRATIVA':     return '—';
      case 'ACERTOS_EXATOS':          return cat.acertosAlvo ? `${cat.acertosAlvo} acertos acumulados` : '…';
      case 'MAIOR_PONTUACAO_SORTEIO': return cat.sorteioReferencia ? `${cat.sorteioReferencia}º sorteio` : '…';
      case 'MAIOR_PONTUACAO_GERAL':   return 'Maior pontuação ao encerrar';
      case 'MENOR_PONTUACAO_GERAL':   return 'Menor pontuação ao encerrar';
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
      _id: id, nome: 'Nova categoria', tipo: 'ACERTOS_EXATOS',
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
        : (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao criar bolão';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
