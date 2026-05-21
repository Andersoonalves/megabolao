import {
  Component, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { MegaSenaAlertComponent } from '../../../shared/components/mega-sena-alert/mega-sena-alert.component';

interface ResultadoPendente {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

interface CheckPendenteResponse {
  hasPendente: boolean;
  resultado: ResultadoPendente | null;
  autoApply: boolean;
}

interface SorteioRecente {
  id: string;
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
  processado: boolean;
}

interface RegistroResult {
  bolaoesProcessados: number;
  sorteios: SorteioRecente[];
}

interface ResultadoCaixa {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

@Component({
  selector: 'nb-registrar-sorteio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, FormsModule, TranslatePipe, MegaSenaAlertComponent, RouterLink],
  templateUrl: './registrar-sorteio.component.html',
})
export class RegistrarSorteioComponent implements OnInit, OnDestroy {
  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  numeroConcurso = signal(0);
  dataSorteio    = signal(new Date().toISOString().split('T')[0]);
  bolasSelected  = signal<number[]>([]);

  recentes       = signal<SorteioRecente[]>([]);
  loadingRecentes = signal(false);
  loading        = signal(false);
  error          = signal('');
  sucesso        = signal(false);
  ultimoConcurso = signal(0);
  ultimosBoloes  = signal(0);

  loadingCaixa  = signal(false);
  erroCaixa     = signal('');
  previewCaixa  = signal<ResultadoCaixa | null>(null);

  pendente       = signal<ResultadoPendente | null>(null);
  autoApply      = signal(false);
  loadingPendente = signal(false);

  // ── Wizard pós-registro ───────────────────────────────────────────────────
  wizardEtapa       = signal<'idle' | 'processando' | 'concluido'>('idle');
  wizardBoloes      = signal(0);
  wizardConcurso    = signal(0);
  wizardSorteioIds  = signal<string[]>([]);
  wizardErroTimeout = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollAttempts = 0;

  valido        = computed(() => this.bolasSelected().length === 6 && this.numeroConcurso() > 0);
  bolasOrdenadas = computed(() => [...this.bolasSelected()].sort((a, b) => a - b));
  readonly nums60 = Array.from({ length: 60 }, (_, i) => i + 1);

  ngOnInit(): void {
    this.loadRecentes();
    void this.checkPendente();
  }

  ngOnDestroy(): void {
    this.stopPoll();
  }

  private async checkPendente(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.get<CheckPendenteResponse>('/sorteios/mega-sena/pendente'));
      this.pendente.set(res.hasPendente ? res.resultado : null);
      this.autoApply.set(res.autoApply);
    } catch { /* silencioso */ }
  }

  async aplicarPendente(): Promise<void> {
    if (this.loadingPendente()) return;
    this.loadingPendente.set(true);
    try {
      await firstValueFrom(this.api.post('/sorteios/mega-sena/aplicar', {}));
      this.pendente.set(null);
      await this.loadRecentes();
      this.sucesso.set(true);
      this.ultimoConcurso.set(this.pendente()?.numeroConcurso ?? 0);
    } catch (err: unknown) {
      this.error.set((err as { error?: { message?: string } })?.error?.message ?? 'Erro ao aplicar resultado');
    } finally {
      this.loadingPendente.set(false);
    }
  }

  async ignorarPendente(): Promise<void> {
    if (this.loadingPendente()) return;
    this.loadingPendente.set(true);
    try {
      await firstValueFrom(this.api.post('/sorteios/mega-sena/ignorar', {}));
      this.pendente.set(null);
    } catch { /* silencioso */ }
    finally { this.loadingPendente.set(false); }
  }

  async toggleAutoApply(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    try {
      await firstValueFrom(this.api.patch('/sorteios/mega-sena/config', { autoApply: checked }));
      this.autoApply.set(checked);
    } catch { this.autoApply.set(!checked); } // reverte se falhar
  }

  async loadRecentes(): Promise<void> {
    this.loadingRecentes.set(true);
    try {
      const res = await firstValueFrom(this.api.get<SorteioRecente[]>('/sorteios/recentes'));
      this.recentes.set(res);
      if (res.length > 0) this.numeroConcurso.set(res[0].numeroConcurso + 1);
    } catch { /* silencioso */ }
    finally { this.loadingRecentes.set(false); }
  }

  toggleBola(n: number): void {
    this.bolasSelected.update(b =>
      b.includes(n) ? b.filter(x => x !== n) : b.length < 6 ? [...b, n] : b,
    );
  }

  bolaClass(n: number): string {
    const sel  = this.bolasSelected().includes(n);
    const full = this.bolasSelected().length >= 6;
    if (sel)  return 'bg-green-700 text-white border-green-700 shadow-sm scale-105';
    if (full) return 'bg-white text-slate-300 border-slate-200 cursor-not-allowed';
    return 'bg-white text-slate-700 border-slate-200 hover:border-green-400 hover:text-green-700 cursor-pointer';
  }

  async submit(): Promise<void> {
    if (!this.valido() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.sucesso.set(false);
    this.wizardEtapa.set('idle');
    try {
      const res = await firstValueFrom(
        this.api.post<RegistroResult>('/sorteios', {
          numeroConcurso: this.numeroConcurso(),
          dataSorteio:    this.dataSorteio(),
          bolasSorteadas: this.bolasOrdenadas(),
        }),
      );
      this.ultimoConcurso.set(this.numeroConcurso());
      this.ultimosBoloes.set(res.bolaoesProcessados);
      this.sucesso.set(true);
      this.bolasSelected.set([]);

      // Inicia wizard de acompanhamento
      const ids = res.sorteios.map(s => s.id);
      this.wizardSorteioIds.set(ids);
      this.wizardConcurso.set(this.numeroConcurso());
      this.wizardBoloes.set(res.bolaoesProcessados);
      this.wizardErroTimeout.set(false);

      if (ids.length > 0 && res.sorteios.every(s => s.processado)) {
        this.wizardEtapa.set('concluido');
      } else {
        this.wizardEtapa.set('processando');
        this.startPoll(ids);
      }

      await this.loadRecentes();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message
        ?? this.translate.instant('errors.registerDraw');
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  novoSorteio(): void {
    this.wizardEtapa.set('idle');
    this.sucesso.set(false);
    this.stopPoll();
  }

  private startPoll(ids: string[]): void {
    this.stopPoll();
    this.pollAttempts = 0;
    this.pollTimer = setInterval(async () => {
      this.pollAttempts++;
      await this.loadRecentes();
      const recentes = this.recentes();
      const todosProcessados = ids.every(id => recentes.find(r => r.id === id)?.processado);

      if (todosProcessados) {
        this.wizardEtapa.set('concluido');
        this.stopPoll();
        return;
      }

      // Timeout após 30 tentativas (~60s)
      if (this.pollAttempts >= 30) {
        this.wizardErroTimeout.set(true);
        this.wizardEtapa.set('concluido');
        this.stopPoll();
      }
    }, 2000);
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async buscarCaixa(): Promise<void> {
    if (this.loadingCaixa()) return;
    this.loadingCaixa.set(true);
    this.erroCaixa.set('');
    this.previewCaixa.set(null);
    try {
      const params = this.numeroConcurso() > 0 ? `?concurso=${this.numeroConcurso()}` : '';
      const res = await firstValueFrom(this.api.get<ResultadoCaixa>(`/sorteios/mega-sena${params}`));
      this.previewCaixa.set(res);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Erro ao buscar resultado na Caixa';
      this.erroCaixa.set(msg);
    } finally {
      this.loadingCaixa.set(false);
    }
  }

  confirmarCaixa(): void {
    const p = this.previewCaixa();
    if (!p) return;
    this.numeroConcurso.set(p.numeroConcurso);
    this.dataSorteio.set(p.dataSorteio);
    this.bolasSelected.set(p.bolasSorteadas);
    this.previewCaixa.set(null);
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }
  fmtDate(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try { return new Date(iso).toLocaleDateString(loc, { day: '2-digit', month: 'short' }); }
    catch { return iso; }
  }
}
