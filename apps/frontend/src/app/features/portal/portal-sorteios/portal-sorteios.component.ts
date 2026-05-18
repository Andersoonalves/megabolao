import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';

interface ResultadoCaixa {
  numeroConcurso: number;
  dataSorteio: string;
  bolasSorteadas: number[];
}

const CACHE_KEY = 'nb_mega_sena_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry { ts: number; data: ResultadoCaixa[]; }

@Component({
  selector: 'nb-portal-sorteios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <!-- Header -->
    <div style="background: linear-gradient(180deg, #065f46, #1a4436)" class="text-white px-4 pt-5 pb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-display text-[22px] font-semibold tracking-tight">Mega-Sena</h1>
          <p class="text-white/70 text-[13px] mt-0.5">Últimos 20 resultados</p>
        </div>
        <button (click)="atualizar()"
                [disabled]="loading()"
                class="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 disabled:opacity-50 text-white text-[12.5px] font-semibold rounded-[10px] transition-colors border border-white/20">
          {{ loading() ? '…' : '🔄' }}
        </button>
      </div>
      @if (ultimo()) {
        <div class="mt-4 p-3 bg-white/10 rounded-xl">
          <div class="text-[10.5px] text-white/60 uppercase tracking-wide mb-1.5">Último sorteio — #{{ ultimo()!.numeroConcurso }}</div>
          <div class="flex gap-2 flex-wrap">
            @for (n of ultimo()!.bolasSorteadas; track n) {
              <span class="w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-[12px] bg-white text-green-900 shadow-sm">
                {{ pad(n) }}
              </span>
            }
          </div>
          <div class="text-[11px] text-white/50 mt-1.5">{{ fmtDate(ultimo()!.dataSorteio) }}</div>
        </div>
      }
    </div>

    <div class="p-4 max-w-2xl mx-auto">

      @if (loading() && resultados().length === 0) {
        <div class="flex flex-col gap-3">
          @for (i of skeleton; track i) {
            <div class="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div class="flex items-center justify-between mb-3">
                <div class="h-4 bg-slate-100 rounded w-20"></div>
                <div class="h-3 bg-slate-100 rounded w-24"></div>
              </div>
              <div class="flex gap-2">
                @for (j of [1,2,3,4,5,6]; track j) {
                  <div class="w-9 h-9 rounded-full bg-slate-100"></div>
                }
              </div>
            </div>
          }
        </div>
      } @else if (error()) {
        <div class="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          ⚠ {{ error() }}
        </div>
      } @else {
        <div class="flex flex-col gap-3">
          @for (r of anteriores(); track r.numeroConcurso) {
            <div class="bg-white rounded-xl border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <span class="font-mono font-bold text-[15px] text-slate-900">#{{ r.numeroConcurso }}</span>
                <span class="text-[12px] text-slate-400">{{ fmtDate(r.dataSorteio) }}</span>
              </div>
              <div class="flex gap-2 flex-wrap">
                @for (n of r.bolasSorteadas; track n) {
                  <span class="w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-[12px] bg-green-700 text-white shadow-sm">
                    {{ pad(n) }}
                  </span>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PortalSorteiosComponent implements OnInit {
  private readonly api       = inject(ApiService);
  private readonly translate = inject(TranslateService);

  loading   = signal(true);
  error     = signal('');
  resultados = signal<ResultadoCaixa[]>([]);

  ultimo    = computed(() => this.resultados()[0] ?? null);
  anteriores = computed(() => this.resultados().slice(1));

  readonly skeleton = Array.from({ length: 5 }, (_, i) => i);

  ngOnInit(): void { void this.carregar(); }

  private lerCache(): ResultadoCaixa[] | null {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
      return entry.data;
    } catch { return null; }
  }

  private gravarCache(data: ResultadoCaixa[]): void {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); }
    catch { /* storage cheio — ignora */ }
  }

  private async carregar(): Promise<void> {
    const cached = this.lerCache();
    if (cached) {
      this.resultados.set(cached);
      this.loading.set(false);
      return;
    }
    await this.buscarApi();
  }

  async atualizar(): Promise<void> {
    if (this.loading()) return;
    sessionStorage.removeItem(CACHE_KEY);
    await this.buscarApi();
  }

  private async buscarApi(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.api.get<ResultadoCaixa[]>('/portal/mega-sena?ultimos=20'),
      );
      const data = Array.isArray(res) ? res : [res];
      this.resultados.set(data);
      this.gravarCache(data);
    } catch {
      this.error.set('Não foi possível carregar os resultados. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }

  fmtDate(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try { return new Date(iso + 'T12:00:00').toLocaleDateString(loc, { weekday: 'short', day: '2-digit', month: 'short' }); }
    catch { return iso; }
  }
}
