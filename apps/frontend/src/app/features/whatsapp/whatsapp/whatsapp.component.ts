import {
  Component, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { QrCodeComponent } from '../../../shared/components/qr-code/qr-code.component';

// ── Types ─────────────────────────────────────────────────────────────────────

type WaStatus = 'DESCONECTADO' | 'CARREGANDO' | 'AGUARDANDO_QR' | 'CONECTADO';

interface SessionInfo { status: WaStatus; qrCode?: string; numero?: string; }
interface Grupo        { id: string; nome: string; qtdParticipantes?: number; vinculadoBolao?: boolean; }
interface MensagemWa {
  id: string; tipo: string; grupo: string; conteudo: string;
  status: 'PENDENTE' | 'ENVIADO' | 'FALHA'; criadoEm: string;
}

interface MsgTemplateRow {
  tipo: string;
  nomeKey: string;
  previewKey: string;
  auto: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nb-whatsapp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, QrCodeComponent, TranslatePipe, RouterLink],
  templateUrl: './whatsapp.component.html',
})
export class WhatsAppComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  // ── State ──────────────────────────────────────────────────────────────────
  session       = signal<SessionInfo | null>(null);
  grupos        = signal<Grupo[]>([]);
  mensagens     = signal<MensagemWa[]>([]);
  acao          = signal(false);
  loadingGrupos = signal(false);
  loadingMsgs   = signal(false);

  /** WhatsApp renova o QR a cada ~60s; renovamos antes via API. */
  private static readonly QR_COUNTDOWN_SEC = 60;

  qrCountdown = signal(WhatsAppComponent.QR_COUNTDOWN_SEC);

  /** Evolution envia PNG em base64; pairing code usa nb-qr-code. */
  readonly qrIsImage = computed(() => (this.session()?.qrCode ?? '').startsWith('data:image'));
  qrExpired   = computed(() => this.qrCountdown() === 0);

  private pollInterval:        ReturnType<typeof setInterval> | null = null;
  private countdownInterval:   ReturnType<typeof setInterval> | null = null;
  private lastQrCode           = '';
  private qrAutoRefreshInFlight = false;
  private _lastCarregandoPoll: number | null = null;
  /** Evita chamar `loadGrupos` em loop quando a lista filtrada fica vazia (ex.: nenhum vínculo em bolões). */
  private gruposFetchDone = false;

  // ── Computed KPIs ──────────────────────────────────────────────────────────
  totalEnviadas = () => this.mensagens().filter(m => m.status === 'ENVIADO').length + DEMO_MSGS.filter(m => m.status === 'ENVIADO').length;
  totalFalhas   = () => this.mensagens().filter(m => m.status === 'FALHA').length;
  pctSucesso    = () => {
    const t = this.mensagens().length;
    const s = this.mensagens().filter(m => m.status === 'ENVIADO').length;
    return t > 0 ? Math.round(s / t * 100) : 96;
  };

  readonly templates: MsgTemplateRow[] = [
    { tipo: 'RESULTADO_SORTEIO', nomeKey: 'whatsapp.tplResultadoSorteioNome', previewKey: 'whatsapp.tplResultadoSorteioPreview', auto: true },
    { tipo: 'PREMIADOS',         nomeKey: 'whatsapp.tplPremiadosNome',       previewKey: 'whatsapp.tplPremiadosPreview',       auto: true },
    { tipo: 'RANKING_PARCIAL',   nomeKey: 'whatsapp.tplRankingNome',         previewKey: 'whatsapp.tplRankingPreview',         auto: true },
    { tipo: 'MANUAL',            nomeKey: 'whatsapp.tplManualNome',          previewKey: 'whatsapp.tplManualPreview',          auto: false },
  ];

  ngOnInit(): void {
    try { localStorage.removeItem('whatsapp_grupo_padrao'); } catch { /* ignore */ }
    this.loadSession();
    this.loadMensagens();

    // Polling adaptativo: 3s esperando QR (usuário ativo), 8s carregando (backend inicializando)
    this.pollInterval = setInterval(() => {
      const s = this.session()?.status;
      if (s === 'AGUARDANDO_QR') {
        void this.loadSession();
      } else if (s === 'CARREGANDO') {
        const now = Date.now();
        if (!this._lastCarregandoPoll || now - this._lastCarregandoPoll >= 8_000) {
          this._lastCarregandoPoll = now;
          void this.loadSession();
        }
      }
    }, 3000);

    // Countdown do QR — decrementa 1s, reseta quando chega QR novo
    this.countdownInterval = setInterval(() => {
      if (this.session()?.status !== 'AGUARDANDO_QR') return;

      const currentQr = this.session()?.qrCode ?? '';
      if (currentQr && currentQr !== this.lastQrCode) {
        this.lastQrCode = currentQr;
        this.qrCountdown.set(WhatsAppComponent.QR_COUNTDOWN_SEC);
        return;
      }

      const next = Math.max(0, this.qrCountdown() - 1);
      this.qrCountdown.set(next);
      if (next === 0 && currentQr && !this.qrAutoRefreshInFlight && !this.acao()) {
        void this.atualizarQrAutomatico();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval)      clearInterval(this.pollInterval);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async loadSession(): Promise<void> {
    try {
      this.session.set(await firstValueFrom(this.api.get<SessionInfo>('/whatsapp/sessao/status')));
      const s = this.session()?.status;
      if (s !== 'CONECTADO') {
        this.gruposFetchDone = false;
        return;
      }
      if (!this.gruposFetchDone) {
        this.gruposFetchDone = true;
        void this.loadGrupos();
      }
    } catch {
      this.session.set({ status: 'DESCONECTADO' });
      this.gruposFetchDone = false;
    }
  }

  /** IDs de grupos que aparecem em `whatsappGrupos` de algum bolão do tenant. */
  private async loadIdsGruposVinculadosBoloes(): Promise<Set<string>> {
    try {
      const res = await firstValueFrom(
        this.api.get<{ data: { id: string }[] }>('/boloes?perPage=100&page=1'),
      );
      const boloes = res.data ?? [];
      const listas = await Promise.all(
        boloes.map(async b => {
          try {
            const wa = await firstValueFrom(
              this.api.get<{ grupos: { id: string }[] }>(`/boloes/${b.id}/whatsapp`),
            );
            return wa.grupos ?? [];
          } catch {
            return [];
          }
        }),
      );
      const ids = new Set<string>();
      for (const arr of listas) {
        for (const g of arr) ids.add(g.id);
      }
      return ids;
    } catch {
      return new Set();
    }
  }

  async loadGrupos(): Promise<void> {
    this.loadingGrupos.set(true);
    try {
      const [sessaoTodos, vinculados] = await Promise.all([
        firstValueFrom(this.api.get<Grupo[]>('/whatsapp/sessao/grupos')),
        this.loadIdsGruposVinculadosBoloes(),
      ]);
      const lista = sessaoTodos.map(g => ({
        ...g,
        vinculadoBolao: vinculados.has(g.id),
      }));
      lista.sort((a, b) => {
        if (a.vinculadoBolao !== b.vinculadoBolao) return a.vinculadoBolao ? -1 : 1;
        return a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' });
      });
      this.grupos.set(lista);
    } catch {
      this.grupos.set([]);
    } finally {
      this.loadingGrupos.set(false);
    }
  }

  async loadMensagens(): Promise<void> {
    this.loadingMsgs.set(true);
    try {
      const res = await firstValueFrom(this.api.get<{ data: MensagemWa[] }>('/whatsapp/mensagens?perPage=20'));
      this.mensagens.set(res.data.length > 0 ? res.data : DEMO_MSGS);
    } catch {
      this.mensagens.set(DEMO_MSGS);
    } finally {
      this.loadingMsgs.set(false);
    }
  }

  async iniciarSessao(): Promise<void> {
    this.acao.set(true);
    try {
      this.session.set(await firstValueFrom(this.api.post<SessionInfo>('/whatsapp/sessao/iniciar', {})));
    } catch { this.session.set({ status: 'CARREGANDO' }); }
    finally { this.acao.set(false); }
  }

  /** Renova QR via /connect (não apaga a instância). */
  private async atualizarQrAutomatico(): Promise<void> {
    this.qrAutoRefreshInFlight = true;
    try {
      const next = await firstValueFrom(
        this.api.post<SessionInfo>('/whatsapp/sessao/qr/atualizar', {}),
      );
      this.session.set(next);
      if (next.qrCode) {
        this.lastQrCode = next.qrCode;
        this.qrCountdown.set(WhatsAppComponent.QR_COUNTDOWN_SEC);
      }
    } catch {
      await this.loadSession();
    } finally {
      this.qrAutoRefreshInFlight = false;
    }
  }

  /** Apaga e recria a instância na Evolution (último recurso). */
  async renovarQr(): Promise<void> {
    if (this.session()?.status !== 'AGUARDANDO_QR' || this.acao()) return;
    this.acao.set(true);
    try {
      const next = await firstValueFrom(
        this.api.post<SessionInfo>('/whatsapp/sessao/qr/renovar', {}),
      );
      this.session.set(next);
      if (next.qrCode) {
        this.lastQrCode = next.qrCode;
        this.qrCountdown.set(WhatsAppComponent.QR_COUNTDOWN_SEC);
      }
    } catch {
      await this.loadSession();
    } finally {
      this.acao.set(false);
    }
  }

  async desconectar(): Promise<void> {
    this.acao.set(true);
    try {
      await firstValueFrom(this.api.delete('/whatsapp/sessao'));
      this.session.set({ status: 'DESCONECTADO' });
      this.grupos.set([]);
      this.gruposFetchDone = false;
    } catch {} finally { this.acao.set(false); }
  }

  async retry(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.post(`/whatsapp/mensagens/${id}/retry`, {}));
      this.mensagens.update(ms => ms.map(m => m.id === id ? { ...m, status: 'PENDENTE' as const } : m));
    } catch {}
  }

  statusColor(): string {
    const st = this.session()?.status;
    if (st === 'CONECTADO')     return '#10b981';
    if (st === 'AGUARDANDO_QR') return '#f59e0b';
    if (st === 'CARREGANDO')    return '#94a3b8';
    return '#ef4444';
  }

  fmtDt(iso: string): string {
    const cur = this.translate.currentLang ?? 'pt';
    const lang = cur.startsWith('en') ? 'en-US' : 'pt-BR';
    try {
      return new Date(iso).toLocaleString(lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_MSGS: MensagemWa[] = [
  { id: 'm1', tipo: 'RESULTADO_SORTEIO', grupo: 'Família CG', conteudo: '🎯 Sorteio #2994 — 04, 07, 12, 23, 28, 31…', status: 'ENVIADO', criadoEm: new Date(Date.now() - 3600000 * 2).toISOString() },
  { id: 'm2', tipo: 'RESULTADO_SORTEIO', grupo: 'Trabalho Sorte', conteudo: '🎯 Sorteio #2994 — 04, 07, 12, 23, 28, 31…', status: 'ENVIADO', criadoEm: new Date(Date.now() - 3600000 * 2).toISOString() },
  { id: 'm3', tipo: 'RESULTADO_SORTEIO', grupo: 'Vizinhos Q12', conteudo: '🎯 Sorteio #2994 — 04, 07, 12, 23, 28, 31…', status: 'FALHA',   criadoEm: new Date(Date.now() - 3600000 * 2).toISOString() },
  { id: 'm4', tipo: 'RANKING_PARCIAL',   grupo: 'Família CG',  conteudo: '📊 Top 10 do bolão após sorteio 3…',          status: 'ENVIADO', criadoEm: new Date(Date.now() - 3600000).toISOString()   },
  { id: 'm5', tipo: 'MANUAL',            grupo: 'Família CG',  conteudo: '📣 Lembrete: confirmem o pagamento até sexta', status: 'ENVIADO', criadoEm: new Date(Date.now() - 86400000).toISOString()  },
];
