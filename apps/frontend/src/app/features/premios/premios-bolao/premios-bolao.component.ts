import {
  Component, signal, computed, input, OnInit, ChangeDetectionStrategy, inject, effect,
  Pipe, PipeTransform,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { MasterTenantService } from '../../../core/services/master-tenant.service';
import { AuthService } from '../../../core/services/auth.service';
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
  imports: [BackButtonComponent, RouterLink, PBrlPipe, TranslatePipe],
  templateUrl: './premios-bolao.component.html',
})
export class PremiosBolaoComponent implements OnInit {
  readonly id = input<string>('');

  private readonly api          = inject(ApiService);
  private readonly translate    = inject(TranslateService);
  private readonly masterTenant = inject(MasterTenantService);
  private readonly auth         = inject(AuthService);

  // ── State ──────────────────────────────────────────────────────────────────
  bolao      = signal<BolaoResponse | null>(null);
  tenantNome = signal('');
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
      const estimativa = (this.bolao()!.valorBrutoArrecadado * cat.percentual / 100)
        + (cat.valorAcumuladoAnterior ?? 0);
      const valorTotal = cat.tipo === 'TAXA_ADMINISTRATIVA'
        ? (this.bolao()!.valorBrutoArrecadado * cat.percentual / 100)
        : (catPremios[0]?.valorTotalCategoria ?? estimativa);
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
    const taxaPct = b.categorias
      .filter(c => c.tipo === 'TAXA_ADMINISTRATIVA')
      .reduce((s, c) => s + c.percentual, 0);
    const poolLiquido = b.valorBrutoArrecadado * (1 - taxaPct / 100);
    if (poolLiquido === 0) return 0;
    return Math.round(this.totalDistribuido() / poolLiquido * 100);
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
    void this.loadTenantNome();
  }

  private async loadTenantNome(): Promise<void> {
    // MASTER: nome já está em memória (MasterTenantService)
    const fromMemory = this.masterTenant.tenant()?.nome;
    if (fromMemory) { this.tenantNome.set(fromMemory); return; }
    // ADMIN: busca do endpoint
    try {
      const t = await firstValueFrom(this.api.get<{ nome: string }>('/tenants/me'));
      this.tenantNome.set(t.nome);
    } catch { /* mantém vazio — fallback no template */ }
  }

  async loadPremios(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.get<PremioResponse[]>(`/boloes/${this.bolaoId}/premios`));
      this.premios.set(res);
    } catch {
      this.error.set(this.translate.instant('premios.errLoad'));
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
      const msg = (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('premios.errCalc');
      this.erroCalculo.set(msg);
    } finally {
      this.calculando.set(false);
    }
  }

  async pagarPremio(pid: string): Promise<void> {
    this.pagandoId.set(pid);
    try {
      await firstValueFrom(this.api.patch(`/boloes/${this.bolaoId}/premios/${pid}/pagar`, {}));
      this.premios.update(ps =>
        ps.map(p => p.id === pid ? { ...p, statusPagamento: 'PAGO' as const, dataPagamento: new Date().toISOString() } : p),
      );
    } catch {
      this.error.set(this.translate.instant('premios.errPay'));
    } finally {
      this.pagandoId.set('');
    }
  }

  toggleShowAll(catId: string): void {
    this.showAll.update(s => ({ ...s, [catId]: !s[catId] }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  poolStatusLabel(s: string): string {
    const k = `premios.poolStatus.${s}`;
    const t = this.translate.instant(k);
    return t !== k ? t : s.toLowerCase();
  }

  tipoDesc(cat: BolaoCategoria): string {
    switch (cat.tipo) {
      case 'TAXA_ADMINISTRATIVA':
        return this.translate.instant('premios.tipoTaxaAdmin');
      case 'ACERTOS_EXATOS':
        return this.translate.instant('premios.tipoAcertosExatos', { n: cat.acertosAlvo ?? 0 });
      case 'MAIOR_PONTUACAO_SORTEIO':
        return this.translate.instant('premios.tipoMaiorSorteio', { n: cat.sorteioReferencia ?? 0 });
      case 'MAIOR_PONTUACAO_GERAL':
        return this.translate.instant('premios.tipoMaiorGeral');
      case 'MENOR_PONTUACAO_GERAL':
        return this.translate.instant('premios.tipoMenorGeral');
      default:
        return cat.tipo;
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
    const cur = this.translate.currentLang ?? 'pt';
    const locale = cur.startsWith('en') ? 'en-US' : 'pt-BR';
    try { return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' }); }
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
