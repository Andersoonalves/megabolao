import { Component, OnDestroy, OnInit, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

type Level = 'ok' | 'degraded' | 'down' | 'checking';

interface ComponentCheck { status: Level; latencyMs?: number; error?: string; }
interface HealthDetail {
  status: Level;
  timestamp: string;
  uptime: number;
  version: string;
  components: { database: ComponentCheck; redis: ComponentCheck; supabase: ComponentCheck; };
}

@Component({
  selector: 'nb-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [BackButtonComponent],
  template: `
    <div class="min-h-screen bg-[#F2F7FB] p-4">
      <div class="max-w-lg mx-auto space-y-4">

        <div class="flex items-center gap-3 pt-2">
          <nb-back-button />
          <h1 class="text-lg font-semibold text-[#444]">Status do Sistema</h1>
        </div>

        <!-- Overall -->
        <div class="rounded-xl bg-white p-4 shadow-sm flex items-center justify-between">
          <div>
            <p class="text-xs text-slate-500 uppercase tracking-wide">Status Geral</p>
            <p class="text-xl font-bold mt-0.5" [style.color]="levelColor(overall())">
              {{ levelLabel(overall()) }}
            </p>
            @if (lastCheck()) {
              <p class="text-xs text-slate-400 mt-1">Verificado {{ lastCheck() }}</p>
            }
          </div>
          <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
               [style.background-color]="levelBg(overall())">
            {{ levelIcon(overall()) }}
          </div>
        </div>

        <!-- Components -->
        <div class="rounded-xl bg-white shadow-sm divide-y divide-slate-100">
          @for (c of components(); track c.name) {
            <div class="flex items-center justify-between px-4 py-3">
              <div class="flex items-center gap-3">
                <span class="text-lg">{{ c.icon }}</span>
                <div>
                  <p class="text-sm font-medium text-[#444]">{{ c.name }}</p>
                  @if (c.check.error) {
                    <p class="text-xs text-red-500 max-w-[220px] truncate">{{ c.check.error }}</p>
                  } @else if (c.check.latencyMs != null) {
                    <p class="text-xs text-slate-400">{{ c.check.latencyMs }}ms</p>
                  }
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium px-2 py-0.5 rounded-full"
                      [style.color]="levelColor(c.check.status)"
                      [style.background-color]="levelBg(c.check.status)">
                  {{ levelLabel(c.check.status) }}
                </span>
              </div>
            </div>
          }
        </div>

        <!-- Vercel (externo — só ping) -->
        <div class="rounded-xl bg-white shadow-sm">
          <div class="flex items-center justify-between px-4 py-3">
            <div class="flex items-center gap-3">
              <span class="text-lg">▲</span>
              <div>
                <p class="text-sm font-medium text-[#444]">Frontend (Vercel)</p>
                @if (vercelLatency() != null) {
                  <p class="text-xs text-slate-400">{{ vercelLatency() }}ms</p>
                }
              </div>
            </div>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full"
                  [style.color]="levelColor(vercelStatus())"
                  [style.background-color]="levelBg(vercelStatus())">
              {{ levelLabel(vercelStatus()) }}
            </span>
          </div>
        </div>

        <!-- Uptime info -->
        @if (uptime()) {
          <p class="text-xs text-center text-slate-400">
            Backend uptime: {{ formatUptime(uptime()!) }} · v{{ version() }}
          </p>
        }

        <button (click)="load()"
                class="w-full min-h-12 rounded-lg bg-[#1F4E79] text-white text-sm font-medium active:opacity-80">
          Verificar agora
        </button>

      </div>
    </div>
  `,
})
export class StatusComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  overall    = signal<Level>('checking');
  vercelStatus  = signal<Level>('checking');
  vercelLatency = signal<number | null>(null);
  lastCheck  = signal('');
  uptime     = signal<number | null>(null);
  version    = signal('');

  components = signal<{ name: string; icon: string; check: ComponentCheck }[]>([
    { name: 'Banco de dados', icon: '🗄️', check: { status: 'checking' } },
    { name: 'Redis / Filas',  icon: '⚡', check: { status: 'checking' } },
    { name: 'Supabase Auth',  icon: '🔐', check: { status: 'checking' } },
  ]);

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    void this.load();
    this.timer = setInterval(() => void this.load(), 30_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async load(): Promise<void> {
    this.overall.set('checking');
    await Promise.all([this.loadBackend(), this.loadVercel()]);
    this.lastCheck.set(new Date().toLocaleTimeString('pt-BR'));
  }

  private async loadBackend(): Promise<void> {
    try {
      const data = await firstValueFrom(this.api.get<HealthDetail>('/health/detail'));
      this.overall.set(data.status);
      this.uptime.set(data.uptime);
      this.version.set(data.version);
      this.components.set([
        { name: 'Banco de dados', icon: '🗄️', check: data.components.database },
        { name: 'Redis / Filas',  icon: '⚡', check: data.components.redis   },
        { name: 'Supabase Auth',  icon: '🔐', check: data.components.supabase },
      ]);
    } catch {
      this.overall.set('down');
      this.components.set(this.components().map(c => ({ ...c, check: { status: 'down' as Level, error: 'Backend inacessível' } })));
    }
  }

  private async loadVercel(): Promise<void> {
    const t0 = Date.now();
    try {
      await fetch('/', { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const ms = Date.now() - t0;
      this.vercelLatency.set(ms);
      this.vercelStatus.set(ms > 3000 ? 'degraded' : 'ok');
    } catch {
      this.vercelStatus.set('down');
      this.vercelLatency.set(null);
    }
  }

  levelColor(s: Level): string {
    if (s === 'ok')       return '#1A6B3C';
    if (s === 'degraded') return '#C25B00';
    if (s === 'down')     return '#B91C1C';
    return '#64748b';
  }

  levelBg(s: Level): string {
    if (s === 'ok')       return '#E2F0E8';
    if (s === 'degraded') return '#FFF3E0';
    if (s === 'down')     return '#FEE2E2';
    return '#f1f5f9';
  }

  levelLabel(s: Level): string {
    if (s === 'ok')       return 'Operacional';
    if (s === 'degraded') return 'Degradado';
    if (s === 'down')     return 'Fora do ar';
    return 'Verificando…';
  }

  levelIcon(s: Level): string {
    if (s === 'ok')       return '✅';
    if (s === 'degraded') return '⚠️';
    if (s === 'down')     return '🔴';
    return '🔄';
  }

  formatUptime(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }
}
