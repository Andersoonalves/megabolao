import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { AuditoriaItem, AuditoriaSeveridade } from '@nossobolao/shared-types';
import { AuditoriaService, ListarAuditoriaQuery } from '../../../core/services/auditoria.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

const SEVERIDADE_CHIP: Record<AuditoriaSeveridade, string> = {
  INFO: 'bg-slate-100 text-slate-700 border-slate-200',
  AVISO: 'bg-orange-50 text-orange-700 border-orange-200',
  CRITICO: 'bg-red-50 text-red-700 border-red-200',
};

@Component({
  selector: 'nb-auditoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, BackButtonComponent, TranslatePipe],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">{{ 'nav.section.system' | translate }}</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">{{ 'nav.audit' | translate }}</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">{{ 'auditoria.topbarShort' | translate }}</span>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">{{ 'auditoria.pageTitle' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px]">{{ 'auditoria.subtitle' | translate }}</p>
      </div>

      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">

        <!-- Filtros -->
        <div class="px-5 py-3.5 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <input [ngModel]="fAcao()" (ngModelChange)="onFiltroChange('acao', $event)"
                 class="px-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700 w-44"
                 [placeholder]="'auditoria.phAcao' | translate" />
          <input [ngModel]="fRecurso()" (ngModelChange)="onFiltroChange('recurso', $event)"
                 class="px-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700 w-32"
                 [placeholder]="'auditoria.phRecurso' | translate" />
          <select [ngModel]="fSeveridade()" (ngModelChange)="onFiltroChange('severidade', $event)"
                  class="px-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700">
            <option value="">{{ 'auditoria.severityAll' | translate }}</option>
            <option value="INFO">INFO</option>
            <option value="AVISO">AVISO</option>
            <option value="CRITICO">CRÍTICO</option>
          </select>
          <input [ngModel]="fDesde()" (ngModelChange)="onFiltroChange('desde', $event)"
                 type="date"
                 class="px-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700" />
          <input [ngModel]="fAte()" (ngModelChange)="onFiltroChange('ate', $event)"
                 type="date"
                 class="px-3 py-1.5 border border-slate-200 rounded-[10px] text-[12.5px] focus:outline-none focus:border-green-700" />
          <button (click)="limparFiltros()"
                  class="px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            {{ 'auditoria.clear' | translate }}
          </button>
        </div>

        @if (error()) {
          <div class="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">⚠ {{ error() }}</div>
        }

        <!-- Tabela desktop -->
        <div class="overflow-x-auto hidden md:block">
          <table class="w-full text-[13px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-2.5">{{ 'auditoria.thWhen' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'auditoria.thWho' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'auditoria.thAction' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'auditoria.thResource' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'auditoria.thSeverity' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'auditoria.thIp' | translate }}</th>
                <th class="px-4 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4,5]; track i) {
                  <tr class="border-b border-slate-100"><td colspan="7" class="px-5 py-3">
                    <div class="h-4 bg-slate-100 rounded animate-pulse w-3/4"></div>
                  </td></tr>
                }
              } @else if (eventos().length === 0) {
                <tr><td colspan="7" class="px-5 py-12 text-center text-slate-400 text-sm">
                  {{ 'auditoria.emptyTable' | translate }}
                </td></tr>
              } @else {
                @for (e of eventos(); track e.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                    <td class="px-5 py-2.5 font-mono text-[11.5px] text-slate-500 whitespace-nowrap">
                      {{ formatData(e.criadoEm) }}
                    </td>
                    <td class="px-4 py-2.5 truncate max-w-[200px]">
                      {{ e.userEmail ?? '—' }}
                    </td>
                    <td class="px-4 py-2.5">
                      <span class="font-mono text-[11.5px] font-semibold">{{ e.acao }}</span>
                    </td>
                    <td class="px-4 py-2.5 text-slate-500 text-[12px]">
                      {{ e.recurso ?? '—' }}
                    </td>
                    <td class="px-4 py-2.5">
                      <span class="px-1.5 py-0.5 border rounded text-[10.5px] font-semibold {{ chipClasse(e.severidade) }}">
                        {{ e.severidade }}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 font-mono text-[11.5px] text-slate-500">
                      {{ e.ip ?? '—' }}
                    </td>
                    <td class="px-4 py-2.5">
                      @if (objectKeys(e.detalhes).length > 0) {
                        <button (click)="abrirDetalhes(e)"
                                class="text-[11px] font-semibold text-green-700 hover:text-green-800">
                          {{ 'auditoria.view' | translate }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Cards mobile -->
        <div class="md:hidden divide-y divide-slate-100">
          @if (loading()) {
            @for (i of [1,2,3]; track i) {
              <div class="p-4">
                <div class="h-4 bg-slate-100 rounded animate-pulse w-3/4 mb-2"></div>
                <div class="h-3 bg-slate-100 rounded animate-pulse w-1/2"></div>
              </div>
            }
          } @else if (eventos().length === 0) {
            <div class="p-8 text-center text-slate-400 text-sm">{{ 'auditoria.emptyMobile' | translate }}</div>
          } @else {
            @for (e of eventos(); track e.id) {
              <div class="p-4">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-mono text-[12px] font-semibold">{{ e.acao }}</span>
                      <span class="px-1.5 py-0.5 border rounded text-[10px] font-semibold {{ chipClasse(e.severidade) }}">
                        {{ e.severidade }}
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-1 truncate">
                      {{ e.userEmail ?? ('common.systemUser' | translate) }} · {{ e.recurso ?? '—' }}
                    </div>
                    <div class="font-mono text-[10.5px] text-slate-400 mt-0.5">
                      {{ formatData(e.criadoEm) }}
                      @if (e.ip) { · {{ e.ip }} }
                    </div>
                  </div>
                  @if (objectKeys(e.detalhes).length > 0) {
                    <button (click)="abrirDetalhes(e)"
                            class="text-[11px] font-semibold text-green-700 hover:text-green-800">
                      {{ 'auditoria.view' | translate }}
                    </button>
                  }
                </div>
              </div>
            }
          }
        </div>

        <!-- Paginação -->
        <div class="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-slate-400 text-xs">{{ 'common.showingOf' | translate:{ shown: eventos().length, total: total() } }}</span>
          <div class="flex gap-1.5">
            <button (click)="prevPage()" [disabled]="page() <= 1 || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              {{ 'common.prevPlain' | translate }}
            </button>
            <span class="px-3 py-1.5 text-sm text-slate-500">{{ page() }} / {{ totalPages() }}</span>
            <button (click)="nextPage()" [disabled]="page() >= totalPages() || loading()"
                    class="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold rounded-lg transition-colors">
              {{ 'common.nextPlain' | translate }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal de detalhes ────────────────────────────────────────────────────── -->
    @if (detalhe()) {
      <div class="fixed inset-0 bg-black/40 z-40" (click)="detalhe.set(null)"></div>
      <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-lg w-[92vw] max-h-[80vh] bg-white shadow-xl z-50 rounded-xl flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 class="font-display font-semibold text-base">{{ detalhe()!.acao }}</h3>
          <button (click)="detalhe.set(null)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto p-5">
          <div class="text-[12px] text-slate-500 mb-3">
            {{ formatData(detalhe()!.criadoEm) }}
            · {{ detalhe()!.userEmail ?? ('common.systemUser' | translate) }}
            @if (detalhe()!.ip) { · {{ detalhe()!.ip }} }
          </div>
          <pre class="bg-slate-50 border border-slate-200 rounded-[10px] p-3 text-[11.5px] font-mono whitespace-pre-wrap break-words">{{ jsonDetalhes() }}</pre>
        </div>
      </div>
    }
  `,
})
export class AuditoriaComponent implements OnInit {
  private readonly api = inject(AuditoriaService);
  private readonly translate = inject(TranslateService);

  eventos    = signal<AuditoriaItem[]>([]);
  loading    = signal(false);
  error      = signal('');
  total      = signal(0);
  totalPages = signal(0);
  page       = signal(1);

  fAcao       = signal('');
  fRecurso    = signal('');
  fSeveridade = signal<AuditoriaSeveridade | ''>('');
  fDesde      = signal('');
  fAte        = signal('');

  detalhe = signal<AuditoriaItem | null>(null);

  private debounceId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const query: ListarAuditoriaQuery = {
        page: this.page(),
        perPage: 30,
        acao: this.fAcao() || undefined,
        recurso: this.fRecurso() || undefined,
        severidade: (this.fSeveridade() || undefined) as AuditoriaSeveridade | undefined,
        desde: this.fDesde() || undefined,
        ate: this.fAte() || undefined,
      };
      const res = await firstValueFrom(this.api.listar(query));
      this.eventos.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.totalPages);
    } catch {
      this.error.set(this.translate.instant('errors.loadAudit'));
    } finally {
      this.loading.set(false);
    }
  }

  onFiltroChange(campo: 'acao' | 'recurso' | 'severidade' | 'desde' | 'ate', valor: string): void {
    if (campo === 'acao') this.fAcao.set(valor);
    if (campo === 'recurso') this.fRecurso.set(valor);
    if (campo === 'severidade') this.fSeveridade.set(valor as AuditoriaSeveridade | '');
    if (campo === 'desde') this.fDesde.set(valor);
    if (campo === 'ate') this.fAte.set(valor);

    if (this.debounceId) clearTimeout(this.debounceId);
    this.debounceId = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 350);
  }

  limparFiltros(): void {
    this.fAcao.set('');
    this.fRecurso.set('');
    this.fSeveridade.set('');
    this.fDesde.set('');
    this.fAte.set('');
    this.page.set(1);
    this.load();
  }

  prevPage(): void { if (this.page() > 1) { this.page.update((p) => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update((p) => p + 1); this.load(); } }

  abrirDetalhes(e: AuditoriaItem): void { this.detalhe.set(e); }

  jsonDetalhes(): string {
    const d = this.detalhe();
    return d ? JSON.stringify(d.detalhes, null, 2) : '';
  }

  chipClasse(s: AuditoriaSeveridade): string { return SEVERIDADE_CHIP[s] ?? SEVERIDADE_CHIP.INFO; }

  formatData(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    return d.toLocaleString(loc, {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  objectKeys(obj: Record<string, unknown> | null | undefined): string[] {
    return obj ? Object.keys(obj) : [];
  }
}
