import {
  Component, signal, computed, input, OnInit, ChangeDetectionStrategy, inject, effect,
  Pipe, PipeTransform,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

// ── Pipe ─────────────────────────────────────────────────────────────────────

@Pipe({ name: 'pBrl', standalone: true, pure: true })
export class PBrlPipe implements PipeTransform {
  transform(n: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PremioResponse {
  id: string;
  cotaId: string;
  cotaNome: string;
  cotaSequencial: number;
  categoriaNome: string;
  categoriaTipo: string;
  valorTotalCategoria: number;
  valorPorGanhador: number;
  statusPagamento: 'PENDENTE' | 'PAGO' | 'INATIVO';
  dataPagamento: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

interface BolaoCategoria {
  id: string;
  nome: string;
  tipo: string;
  percentual: number;
  acertosAlvo: number | null;
  sorteioReferencia: number | null;
  acumulaSemGanhador: boolean;
  valorAcumuladoAnterior: number;
  ordem: number;
}

interface BolaoResponse {
  id: string;
  nome: string;
  status: string;
  valorCota: number;
  totalCotasAtivas: number;
  valorBrutoArrecadado: number;
  categorias: BolaoCategoria[];
}

// Categoria enriquecida com premios agrupados
interface CategoriaView {
  cat: BolaoCategoria;
  premios: PremioResponse[];
  valorTotal: number;
  valorPorGanhador: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-premios-bolao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, PBrlPipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">Bolão</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">Prêmios</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">Prêmios</span>
      <a routerLink="/relatorios"
         class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold rounded-[10px] no-underline text-slate-700 transition-colors min-h-9 hidden sm:inline-flex">
        ↓ Relatório de ganhadores
      </a>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-6">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">
          Prêmios — {{ bolao()?.nome ?? 'Bolão' }}
        </h1>
        @if (bolao()) {
          <p class="text-slate-500 text-[13.5px]">
            Bolão {{ statusLabel(bolao()!.status) }} · arrecadação bruta {{ bolao()!.valorBrutoArrecadado | pBrl }}
          </p>
        }
      </div>

      @if (error()) {
        <div class="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {{ error() }}</div>
      }

      <!-- KPIs -->
      @if (bolao()) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">Bruto arrecadado</div>
            <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular text-amber-600">{{ bolao()!.valorBrutoArrecadado | pBrl }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">{{ bolao()!.totalCotasAtivas }} cotas × R$ {{ bolao()!.valorCota }}</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">Distribuído</div>
            <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular">{{ totalDistribuido() | pBrl }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">{{ pctDistribuido() }}% do bruto</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">Ganhadores</div>
            <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular">{{ totalGanhadores() }}</div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">{{ categoriasComPremios() }} categorias</div>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
            <div class="text-[11.5px] font-semibold text-slate-500 uppercase tracking-widest">A pagar</div>
            <div class="font-display text-[22px] font-semibold tracking-tight mt-1 tabular"
                 [class]="totalAPagar() > 0 ? 'text-amber-600' : 'text-green-700'">
              {{ totalAPagar() | pBrl }}
            </div>
            <div class="text-[11.5px] text-slate-400 mt-0.5">{{ qtdPendente() }} pendentes</div>
          </div>
        </div>
      }

      <!-- Estado: carregando -->
      @if (loading()) {
        <div class="flex flex-col gap-4">
          @for (i of [1,2,3]; track i) {
            <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div class="p-5 flex gap-4">
                <div class="w-11 h-11 bg-slate-100 rounded-xl animate-pulse flex-shrink-0"></div>
                <div class="flex-1">
                  <div class="h-5 bg-slate-100 rounded animate-pulse w-1/3 mb-2"></div>
                  <div class="h-4 bg-slate-100 rounded animate-pulse w-1/2"></div>
                </div>
              </div>
            </div>
          }
        </div>

      <!-- Estado: bolão não finalizado -->
      } @else if (bolao() && bolao()!.status !== 'FINALIZADO') {
        <div class="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div class="text-4xl mb-4">🏆</div>
          <h3 class="font-display text-lg font-semibold mb-2">Prêmios não calculados ainda</h3>
          <p class="text-slate-400 text-sm mb-1">O bolão precisa estar <strong>FINALIZADO</strong> para calcular prêmios.</p>
          <p class="text-slate-400 text-sm">Status atual: <span class="font-semibold">{{ bolao()?.status }}</span></p>
        </div>

      <!-- Estado: prêmios ainda não calculados -->
      } @else if (bolao()?.status === 'FINALIZADO' && !loading() && premios().length === 0) {
        <div class="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div class="text-4xl mb-4">⚡</div>
          <h3 class="font-display text-lg font-semibold mb-2">Prêmios não calculados</h3>
          <p class="text-slate-400 text-sm mb-6">Todos os sorteios precisam estar processados. O cálculo é idempotente — pode rodar múltiplas vezes com segurança.</p>
          <button (click)="calcular()" [disabled]="calculando()"
                  class="inline-flex items-center gap-2 px-6 py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors shadow-sm">
            {{ calculando() ? '⟳ Calculando...' : '⚡ Calcular prêmios agora' }}
          </button>
          @if (erroCalculo()) {
            <p class="mt-4 text-sm text-red-600">{{ erroCalculo() }}</p>
          }
        </div>

      <!-- Estado: premios carregados — cards por categoria -->
      } @else {
        <div class="flex flex-col gap-4">
          @for (cv of categoriasView(); track cv.cat.id) {
            <div class="bg-white border border-slate-200 rounded-lg overflow-hidden"
                 [class]="cv.cat.tipo === 'TAXA_ADMINISTRATIVA' ? 'opacity-75' : ''">

              <!-- Card header -->
              <div class="flex items-start gap-4 p-5 border-b border-slate-100 flex-wrap">
                <!-- Ícone -->
                <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                     [style]="catIconStyle(cv)">
                  {{ catIcon(cv) }}
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-display font-semibold text-[16px]">{{ cv.cat.nome }}</h3>
                    @if (cv.cat.acumulaSemGanhador && cv.premios.length === 0) {
                      <span class="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 text-[10.5px] font-semibold rounded-full uppercase tracking-wide">
                        acumula no próximo
                      </span>
                    }
                  </div>
                  <p class="text-slate-400 text-[12px] mt-0.5">{{ tipoDesc(cv.cat) }} · {{ cv.cat.percentual }}% do bruto</p>
                </div>

                <!-- Valores -->
                <div class="flex gap-6 items-center flex-shrink-0">
                  <div class="text-right">
                    <div class="text-[11px] text-slate-400">Valor da categoria</div>
                    <div class="font-display font-semibold text-[18px] tabular">{{ cv.valorTotal | pBrl }}</div>
                  </div>
                  @if (cv.cat.tipo !== 'TAXA_ADMINISTRATIVA') {
                    <div class="text-right">
                      <div class="text-[11px] text-slate-400">
                        {{ cv.premios.length === 0 ? 'Ganhadores' : 'Por ganhador' }}
                      </div>
                      <div class="font-display font-semibold text-[18px] tabular">
                        {{ cv.premios.length === 0 ? '—' : (cv.valorPorGanhador | pBrl) }}
                      </div>
                    </div>
                  } @else {
                    <div class="text-right">
                      <div class="text-[11px] text-slate-400">Destino</div>
                      <div class="font-display font-semibold text-[18px]">Tenant</div>
                    </div>
                  }
                </div>
              </div>

              <!-- Ganhadores (table) -->
              @if (cv.premios.length > 0) {
                <div class="overflow-x-auto">
                  <table class="w-full text-[13px]">
                    <thead class="bg-slate-50">
                      <tr>
                        <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Cota</th>
                        <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Participante</th>
                        <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Valor</th>
                        <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">Status</th>
                        <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden sm:table-cell">Pago em</th>
                        <th class="px-4 py-2.5 w-32"></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of cv.premios.slice(0, showAll()[cv.cat.id] ? 999 : 3); track p.id) {
                        <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                          <td class="px-4 py-3 font-mono font-semibold text-[12.5px]">#{{ p.cotaSequencial }}</td>
                          <td class="px-4 py-3 font-semibold">{{ p.cotaNome }}</td>
                          <td class="px-4 py-3 font-mono font-semibold tabular text-amber-700">{{ p.valorPorGanhador | pBrl }}</td>
                          <td class="px-4 py-3">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-wide uppercase border"
                                  [class]="p.statusPagamento === 'PAGO' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-100'">
                              <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                              {{ p.statusPagamento }}
                            </span>
                          </td>
                          <td class="px-4 py-3 text-slate-400 text-[12px] hidden sm:table-cell">
                            {{ p.dataPagamento ? fmtDate(p.dataPagamento) : '—' }}
                          </td>
                          <td class="px-4 py-3">
                            @if (p.statusPagamento === 'PENDENTE') {
                              <button (click)="pagarPremio(p.id)"
                                      [disabled]="pagandoId() === p.id"
                                      class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-[12px] font-semibold rounded-lg transition-colors min-h-8">
                                {{ pagandoId() === p.id ? '...' : '✓ Pagar' }}
                              </button>
                            } @else {
                              <button class="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-sm">⋯</button>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (cv.premios.length > 3 && !showAll()[cv.cat.id]) {
                  <button (click)="toggleShowAll(cv.cat.id)"
                          class="w-full py-3 text-center text-[12.5px] text-slate-500 hover:text-slate-700 border-t border-slate-100 transition-colors">
                    + {{ cv.premios.length - 3 }} ganhadores — ver todos
                  </button>
                }

              <!-- Sem ganhadores / acumulado -->
              } @else if (cv.cat.tipo !== 'TAXA_ADMINISTRATIVA') {
                <div class="px-5 py-4 text-center text-[13px] text-slate-400 border-t border-slate-100">
                  @if (cv.cat.acumulaSemGanhador) {
                    Sem ganhadores · valor de <strong class="text-slate-600">{{ cv.valorTotal | pBrl }}</strong> transferido para o próximo bolão
                  } @else {
                    Sem ganhadores nesta categoria
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PremiosBolaoComponent implements OnInit {
  readonly id = input<string>('');

  private readonly api = inject(ApiService);

  // ── State ──────────────────────────────────────────────────────────────────
  bolao      = signal<BolaoResponse | null>(null);
  premios    = signal<PremioResponse[]>([]);
  loading    = signal(false);
  calculando = signal(false);
  pagandoId  = signal('');
  error      = signal('');
  erroCalculo = signal('');
  showAll    = signal<Record<string, boolean>>({});

  // ── Computed ───────────────────────────────────────────────────────────────
  categoriasView = computed<CategoriaView[]>(() => {
    const cats = this.bolao()?.categorias ?? [];
    const premiosList = this.premios();

    return cats.map(cat => {
      const catPremios = premiosList.filter(p => p.categoriaNome === cat.nome);
      const valorTotal = cat.tipo === 'TAXA_ADMINISTRATIVA'
        ? (this.bolao()!.valorBrutoArrecadado * cat.percentual / 100)
        : (catPremios[0]?.valorTotalCategoria ?? this.bolao()!.valorBrutoArrecadado * cat.percentual / 100);
      return {
        cat,
        premios: catPremios,
        valorTotal,
        valorPorGanhador: catPremios[0]?.valorPorGanhador ?? 0,
      };
    });
  });

  totalDistribuido   = computed(() => this.premios().reduce((s, p) => s + p.valorPorGanhador, 0));
  totalGanhadores    = computed(() => this.premios().length);
  categoriasComPremios = computed(() => new Set(this.premios().map(p => p.categoriaNome)).size);
  totalAPagar        = computed(() => this.premios().filter(p => p.statusPagamento === 'PENDENTE').reduce((s, p) => s + p.valorPorGanhador, 0));
  qtdPendente        = computed(() => this.premios().filter(p => p.statusPagamento === 'PENDENTE').length);
  pctDistribuido     = computed(() => {
    const b = this.bolao();
    if (!b || b.valorBrutoArrecadado === 0) return 0;
    return Math.round(this.totalDistribuido() / b.valorBrutoArrecadado * 100);
  });

  constructor() {
    effect(() => {
      const bid = this.id();
      if (bid) { this.loadBolao(); this.loadPremios(); }
    });
  }

  ngOnInit(): void {
    if (!this.id()) { this.loadBolao(); this.loadPremios(); }
  }

  private get bolaoId(): string {
    return this.id() || '00000000-0000-0000-0000-000000000002';
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  async loadBolao(): Promise<void> {
    try {
      this.bolao.set(await firstValueFrom(this.api.get<BolaoResponse>(`/boloes/${this.bolaoId}`)));
    } catch { this.bolao.set(DEMO_BOLAO); }
  }

  async loadPremios(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.get<PremioResponse[]>(`/boloes/${this.bolaoId}/premios`));
      this.premios.set(res);
    } catch {
      this.error.set('Erro ao carregar prêmios. Exibindo dados de demonstração.');
      this.premios.set(DEMO_PREMIOS);
    } finally {
      this.loading.set(false);
    }
  }

  async calcular(): Promise<void> {
    this.calculando.set(true);
    this.erroCalculo.set('');
    try {
      const res = await firstValueFrom(this.api.post<PremioResponse[]>(`/boloes/${this.bolaoId}/premios/calcular`, {}));
      this.premios.set(res);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao calcular prêmios';
      this.erroCalculo.set(msg);
    } finally {
      this.calculando.set(false);
    }
  }

  async pagarPremio(id: string): Promise<void> {
    this.pagandoId.set(id);
    try {
      await firstValueFrom(this.api.patch(`/boloes/${this.bolaoId}/premios/${id}/pagar`, {}));
      this.premios.update(ps =>
        ps.map(p => p.id === id ? { ...p, statusPagamento: 'PAGO' as const, dataPagamento: new Date().toISOString() } : p),
      );
    } catch {
      this.error.set('Erro ao registrar pagamento. Tente novamente.');
    } finally {
      this.pagandoId.set('');
    }
  }

  toggleShowAll(catId: string): void {
    this.showAll.update(s => ({ ...s, [catId]: !s[catId] }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  statusLabel(s: string): string {
    const map: Record<string, string> = {
      FINALIZADO: 'finalizado', EM_ANDAMENTO: 'em andamento', A_SER_INICIADO: 'aguardando início',
    };
    return map[s] ?? s.toLowerCase();
  }

  tipoDesc(cat: BolaoCategoria): string {
    switch (cat.tipo) {
      case 'TAXA_ADMINISTRATIVA':     return 'Taxa administrativa';
      case 'ACERTOS_EXATOS':          return `Acertos exatos · ${cat.acertosAlvo} acertos`;
      case 'MAIOR_PONTUACAO_SORTEIO': return `Maior pont. · ${cat.sorteioReferencia}º sorteio`;
      case 'MAIOR_PONTUACAO_GERAL':   return 'Maior pontuação geral';
      case 'MENOR_PONTUACAO_GERAL':   return 'Menor pontuação geral';
      default: return cat.tipo;
    }
  }

  catIcon(cv: CategoriaView): string {
    if (cv.cat.tipo === 'TAXA_ADMINISTRATIVA') return '⚙';
    const maxPct = Math.max(...(this.bolao()?.categorias.filter(c => c.tipo !== 'TAXA_ADMINISTRATIVA').map(c => c.percentual) ?? [0]));
    return cv.cat.percentual === maxPct ? '👑' : '🏆';
  }

  catIconStyle(cv: CategoriaView): string {
    if (cv.cat.tipo === 'TAXA_ADMINISTRATIVA') return 'background:#f1f5f9; color:#64748b';
    const maxPct = Math.max(...(this.bolao()?.categorias.filter(c => c.tipo !== 'TAXA_ADMINISTRATIVA').map(c => c.percentual) ?? [0]));
    if (cv.cat.percentual === maxPct) return 'background:linear-gradient(135deg,#f59e0b,#d97706); color:#fff';
    return 'background:#ecfdf5; color:#047857';
  }

  fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); }
    catch { return iso; }
  }
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_BOLAO: BolaoResponse = {
  id: 'demo', nome: 'Bolão Mega 2989', status: 'FINALIZADO',
  valorCota: 20, totalCotasAtivas: 9244, valorBrutoArrecadado: 184880,
  categorias: [
    { id: 'c1', nome: 'Taxa Administrativa',    tipo: 'TAXA_ADMINISTRATIVA',     percentual: 15, acertosAlvo: null, sorteioReferencia: null, acumulaSemGanhador: false, valorAcumuladoAnterior: 0, ordem: 1 },
    { id: 'c2', nome: 'Prêmio Principal',       tipo: 'ACERTOS_EXATOS',          percentual: 55, acertosAlvo: 10,  sorteioReferencia: null, acumulaSemGanhador: false, valorAcumuladoAnterior: 0, ordem: 2 },
    { id: 'c3', nome: 'Mais Pontos 1º Sorteio', tipo: 'MAIOR_PONTUACAO_SORTEIO', percentual: 10, acertosAlvo: null, sorteioReferencia: 1,  acumulaSemGanhador: false, valorAcumuladoAnterior: 0, ordem: 3 },
    { id: 'c4', nome: '09 Pontos — Mais Pontos',tipo: 'ACERTOS_EXATOS',          percentual: 10, acertosAlvo: 9,   sorteioReferencia: null, acumulaSemGanhador: true,  valorAcumuladoAnterior: 0, ordem: 4 },
    { id: 'c5', nome: 'Menos Pontos',           tipo: 'MENOR_PONTUACAO_GERAL',   percentual: 10, acertosAlvo: null, sorteioReferencia: null, acumulaSemGanhador: false, valorAcumuladoAnterior: 0, ordem: 5 },
  ],
};

const DEMO_PREMIOS: PremioResponse[] = [
  { id: 'p1', cotaId: 'c1', cotaNome: 'MARIA L. SOUZA',  cotaSequencial: 4164, categoriaNome: 'Prêmio Principal',       categoriaTipo: 'ACERTOS_EXATOS',          valorTotalCategoria: 101684, valorPorGanhador: 101684, statusPagamento: 'PAGO',    dataPagamento: '2026-04-28T21:00:00Z', criadoEm: '', atualizadoEm: '' },
  { id: 'p2', cotaId: 'c2', cotaNome: 'JOÃO PEDRO M.',   cotaSequencial: 213,  categoriaNome: 'Mais Pontos 1º Sorteio', categoriaTipo: 'MAIOR_PONTUACAO_SORTEIO', valorTotalCategoria: 18488,  valorPorGanhador: 6162.67, statusPagamento: 'PAGO',    dataPagamento: '2026-04-29T10:00:00Z', criadoEm: '', atualizadoEm: '' },
  { id: 'p3', cotaId: 'c3', cotaNome: 'CARLOS E. LIMA',  cotaSequencial: 1837, categoriaNome: 'Mais Pontos 1º Sorteio', categoriaTipo: 'MAIOR_PONTUACAO_SORTEIO', valorTotalCategoria: 18488,  valorPorGanhador: 6162.67, statusPagamento: 'PAGO',    dataPagamento: '2026-04-29T10:00:00Z', criadoEm: '', atualizadoEm: '' },
  { id: 'p4', cotaId: 'c4', cotaNome: 'LUCAS PEREIRA',   cotaSequencial: 902,  categoriaNome: 'Mais Pontos 1º Sorteio', categoriaTipo: 'MAIOR_PONTUACAO_SORTEIO', valorTotalCategoria: 18488,  valorPorGanhador: 6162.66, statusPagamento: 'PENDENTE', dataPagamento: null,                    criadoEm: '', atualizadoEm: '' },
  { id: 'p5', cotaId: 'c5', cotaNome: 'ANA C. RIBEIRO',  cotaSequencial: 6029, categoriaNome: 'Menos Pontos',           categoriaTipo: 'MENOR_PONTUACAO_GERAL',   valorTotalCategoria: 18488,  valorPorGanhador: 18488,   statusPagamento: 'PENDENTE', dataPagamento: null,                    criadoEm: '', atualizadoEm: '' },
];
