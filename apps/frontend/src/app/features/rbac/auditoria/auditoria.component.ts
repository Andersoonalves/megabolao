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
  templateUrl: './auditoria.component.html',
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
