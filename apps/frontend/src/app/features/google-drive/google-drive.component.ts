import {
  Component, signal, input, OnInit, ChangeDetectionStrategy, inject, effect,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BolaoInfo { id: string; nome: string; status: string; }

interface SheetsStatus {
  vinculada: boolean;
  spreadsheetId: string | null;
  ativo: boolean;
  ultimaSyncAt: string | null;
  ultimoErro: string | null;
}

interface PreviewRow {
  linha: number;
  nome: string;
  celular: string | null;
  palpites: number[];
  valida: boolean;
  erro: string | null;
}

interface PreviewResult { total: number; validas: number; invalidas: number; preview: PreviewRow[]; }
interface ImportResult  { total: number; criadas: number; erros: { linha: number; erro: string }[]; }
interface ExportResult  { abas: string[]; linhasExportadas: number; }

// ── Helper: extrai spreadsheetId de URL ou ID direto ─────────────────────────

function extractSheetId(raw: string): string {
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw.trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-google-drive',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, FormsModule, TranslatePipe],
  templateUrl: './google-drive.component.html',
})
export class GoogleDriveComponent implements OnInit {
  readonly id = input<string>('');
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  bolao        = signal<BolaoInfo | null>(null);
  sheetsStatus = signal<SheetsStatus | null>(null);

  // Vincular state
  vincularUrl   = signal('');
  vinculando    = signal(false);
  desvinculando = signal(false);
  sincronizando = signal(false);
  syncSucesso   = signal(false);
  vincularError = signal('');

  // Import state
  iUrl          = signal('');
  iRange        = signal('');
  iIgnorarErros = signal(true);
  iPreviewing   = signal(false);
  iLoading      = signal(false);
  iError        = signal('');
  previewResult = signal<PreviewResult | null>(null);
  importResult  = signal<ImportResult | null>(null);

  // Export state
  eUrl         = signal('');
  eAba         = signal('');
  eLoading     = signal<'completo' | 'ranking' | false>(false);
  eError       = signal('');
  exportResult = signal<ExportResult | null>(null);

  constructor() {
    effect(() => { if (this.id()) this.loadBolao(); });
  }

  ngOnInit(): void {}

  private async loadBolao(): Promise<void> {
    try {
      const [b, status] = await Promise.all([
        firstValueFrom(this.api.get<BolaoInfo>(`/boloes/${this.id()}`)),
        firstValueFrom(this.api.get<SheetsStatus>(`/boloes/${this.id()}/google-drive/status`)),
      ]);
      this.bolao.set(b);
      this.sheetsStatus.set(status);
    } catch { /* silencioso */ }
  }

  async vincular(): Promise<void> {
    const sid = extractSheetId(this.vincularUrl());
    if (!sid) return;
    this.vinculando.set(true);
    this.vincularError.set('');
    try {
      const status = await firstValueFrom(
        this.api.post<SheetsStatus>(`/boloes/${this.id()}/google-drive/vincular`, { spreadsheetId: sid }),
      );
      this.sheetsStatus.set(status);
      this.vincularUrl.set('');
    } catch (err: unknown) {
      this.vincularError.set((err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('googleDrive.errLink'));
    } finally {
      this.vinculando.set(false);
    }
  }

  async desvincular(): Promise<void> {
    this.desvinculando.set(true);
    try {
      await firstValueFrom(this.api.delete(`/boloes/${this.id()}/google-drive/vincular`));
      this.sheetsStatus.set({ vinculada: false, spreadsheetId: null, ativo: false, ultimaSyncAt: null, ultimoErro: null });
    } catch { /* silencioso */ } finally {
      this.desvinculando.set(false);
    }
  }

  async sincronizarAgora(): Promise<void> {
    this.sincronizando.set(true);
    this.syncSucesso.set(false);
    const syncAtAntes = this.sheetsStatus()?.ultimaSyncAt ?? null;

    try {
      await firstValueFrom(this.api.post(`/boloes/${this.id()}/google-drive/sincronizar`, {}));

      // Poll status até ultimaSyncAt mudar (job assíncrono — aguarda até 30s)
      let tentativas = 0;
      const maxTentativas = 15;
      while (tentativas < maxTentativas) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const status = await firstValueFrom(
            this.api.get<SheetsStatus>(`/boloes/${this.id()}/google-drive/status`),
          );
          this.sheetsStatus.set(status);
          if (status.ultimaSyncAt !== syncAtAntes) {
            this.syncSucesso.set(true);
            setTimeout(() => this.syncSucesso.set(false), 4000);
            break;
          }
          if (status.ultimoErro) break; // falhou — para de esperar
        } catch { break; }
        tentativas++;
      }
    } catch { /* silencioso */ } finally {
      this.sincronizando.set(false);
    }
  }

  sheetUrl(): string {
    const sid = this.sheetsStatus()?.spreadsheetId ?? '';
    return `https://docs.google.com/spreadsheets/d/${sid}/edit`;
  }

  fmtDateTime(iso: string): string {
    const cur = this.translate.currentLang ?? 'pt';
    const locale = cur.startsWith('en') ? 'en-US' : 'pt-BR';
    try {
      return new Date(iso).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return this.translate.instant('common.emDash');
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────────

  async preview(): Promise<void> {
    const sid = extractSheetId(this.iUrl());
    if (!sid) return;
    this.iPreviewing.set(true);
    this.iError.set('');
    this.previewResult.set(null);
    this.importResult.set(null);
    try {
      const res = await firstValueFrom(
        this.api.post<PreviewResult>(`/boloes/${this.id()}/google-drive/preview`, {
          spreadsheetId: sid,
          ...(this.iRange() && { range: this.iRange() }),
          ignorarErros: this.iIgnorarErros(),
        }),
      );
      this.previewResult.set(res);
    } catch (err: unknown) {
      this.iError.set((err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('googleDrive.errPreview'));
    } finally {
      this.iPreviewing.set(false);
    }
  }

  async importar(): Promise<void> {
    const sid = extractSheetId(this.iUrl());
    if (!sid) return;
    this.iLoading.set(true);
    this.iError.set('');
    this.importResult.set(null);
    this.previewResult.set(null);
    try {
      const res = await firstValueFrom(
        this.api.post<ImportResult>(`/boloes/${this.id()}/google-drive/importar`, {
          spreadsheetId: sid,
          ...(this.iRange() && { range: this.iRange() }),
          ignorarErros: this.iIgnorarErros(),
        }),
      );
      this.importResult.set(res);
    } catch (err: unknown) {
      this.iError.set((err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('googleDrive.errImport'));
    } finally {
      this.iLoading.set(false);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  async exportarCompleto(): Promise<void> {
    const sid = extractSheetId(this.eUrl());
    if (!sid || this.eLoading()) return;
    this.eLoading.set('completo');
    this.eError.set('');
    this.exportResult.set(null);
    try {
      const res = await firstValueFrom(
        this.api.post<ExportResult>(`/boloes/${this.id()}/google-drive/exportar/completo`, {
          spreadsheetId: sid,
        }),
      );
      this.exportResult.set(res);
    } catch (err: unknown) {
      this.eError.set((err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('googleDrive.errExport'));
    } finally {
      this.eLoading.set(false);
    }
  }

  async exportarRanking(): Promise<void> {
    const sid = extractSheetId(this.eUrl());
    if (!sid || this.eLoading()) return;
    this.eLoading.set('ranking');
    this.eError.set('');
    this.exportResult.set(null);
    try {
      await firstValueFrom(
        this.api.post<void>(`/boloes/${this.id()}/google-drive/exportar/resultados`, {
          spreadsheetId: sid,
          ...(this.eAba() && { aba: this.eAba() }),
        }),
      );
      this.exportResult.set({ abas: [this.eAba() || this.translate.instant('googleDrive.rankingTabPh')], linhasExportadas: 0 });
    } catch (err: unknown) {
      this.eError.set((err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('googleDrive.errExport'));
    } finally {
      this.eLoading.set(false);
    }
  }
}
