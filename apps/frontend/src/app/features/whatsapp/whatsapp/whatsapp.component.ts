import {
  Component, signal, OnInit, OnDestroy, ChangeDetectionStrategy, inject,
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
interface Grupo        { id: string; nome: string; qtdParticipantes?: number; }
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
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1 flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-2 text-[12.5px] min-w-0">
          <span class="text-slate-400">{{ 'whatsapp.brand' | translate }}</span>
          <span class="text-slate-300">›</span>
          <span class="font-semibold">{{ 'whatsapp.title' | translate }}</span>
        </div>
        <span class="font-display font-semibold text-[14px] sm:hidden truncate">{{ 'whatsapp.title' | translate }}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <a routerLink="/whatsapp/templates"
           class="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-[10px] no-underline transition-colors min-h-9">
          {{ 'whatsapp.templatesCta' | translate }}
        </a>
        <a routerLink="/whatsapp/nova-mensagem"
           class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] transition-colors shadow-sm min-h-9 no-underline">
          {{ 'whatsapp.newMessage' | translate }}
        </a>
      </div>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">{{ 'whatsapp.title' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px]">{{ 'whatsapp.subtitle' | translate: { g: grupos().length, m: totalEnviadas() } }}</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">

        <!-- ── Sidebar ─────────────────────────────────────────────────────── -->
        <aside class="flex flex-col gap-4">

          <!-- Sessão -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-4 py-3.5 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[14px]">{{ 'whatsapp.sessionTitle' | translate }}</h3>
            </div>
            <div class="p-4">
              <!-- Status indicator -->
              <div class="flex items-center gap-2.5 mb-4">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      [style.background]="statusColor()"
                      [style.box-shadow]="session()?.status === 'CONECTADO' ? '0 0 0 4px rgba(16,185,129,0.2)' : 'none'"></span>
                <div>
                  <div class="font-semibold text-[13.5px]">
                    @switch (session()?.status) {
                      @case ('CONECTADO') { {{ 'whatsapp.statusConnected' | translate }} }
                      @case ('AGUARDANDO_QR') { {{ 'whatsapp.statusQr' | translate }} }
                      @case ('CARREGANDO') { {{ 'whatsapp.statusConnecting' | translate }} }
                      @default { {{ 'whatsapp.statusDisconnected' | translate }} }
                    }
                  </div>
                  @if (session()?.numero) {
                    <div class="text-slate-400 text-[11.5px]">{{ 'whatsapp.sessionActiveLine' | translate: { num: session()!.numero } }}</div>
                  }
                </div>
              </div>

              <!-- QR Code -->
              @if (session()?.status === 'AGUARDANDO_QR') {
                <div class="mb-4 rounded-xl border border-slate-200 overflow-hidden">
                  <!-- Instruções -->
                  <div class="px-4 py-3 bg-slate-50 border-b border-slate-200 text-center">
                    <p class="text-[12px] text-slate-600 leading-relaxed">
                      {{ 'whatsapp.qrPart1' | translate }}<strong>{{ 'whatsapp.qrBold1' | translate }}</strong>{{ 'whatsapp.qrPart2' | translate }}<strong>{{ 'whatsapp.qrBold2' | translate }}</strong>{{ 'whatsapp.qrPart3' | translate }}<strong>{{ 'whatsapp.qrBold3' | translate }}</strong>
                    </p>
                  </div>

                  <!-- QR image -->
                  <div class="flex flex-col items-center p-4 bg-white">
                    @if (session()?.qrCode) {
                      <nb-qr-code [data]="session()!.qrCode!" [size]="220" />
                    } @else {
                      <div class="w-[220px] h-[220px] flex items-center justify-center bg-slate-50 rounded-xl">
                        <div class="flex gap-1">
                          <div class="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style="animation-delay:0ms"></div>
                          <div class="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style="animation-delay:150ms"></div>
                          <div class="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style="animation-delay:300ms"></div>
                        </div>
                      </div>
                    }
                    <div class="mt-3 flex items-center gap-1.5 text-[11.5px] text-slate-400">
                      <div class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                      {{ 'whatsapp.awaitingQr' | translate }}
                    </div>
                    <button type="button" (click)="renovarQr()" [disabled]="acao()"
                            class="mt-4 w-full max-w-[220px] inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-[10px] border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors min-h-10">
                      {{ acao() ? ('whatsapp.refreshQrWorking' | translate) : ('whatsapp.refreshQr' | translate) }}
                    </button>
                    <p class="mt-2 text-center text-[10.5px] text-slate-500 max-w-[240px] leading-snug">{{ 'whatsapp.refreshQrHint' | translate }}</p>
                  </div>
                </div>
              }

              <div class="flex gap-2">
                @if (session()?.status === 'CONECTADO') {
                  <button (click)="desconectar()" [disabled]="acao()"
                          class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-sm font-semibold rounded-[10px] text-slate-700 transition-colors">
                    {{ acao() ? ('whatsapp.ellipsis' | translate) : ('whatsapp.reconnect' | translate) }}
                  </button>
                } @else {
                  <button (click)="iniciarSessao()" [disabled]="acao() || session()?.status === 'CARREGANDO'"
                          class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-semibold rounded-[10px] transition-colors">
                    {{ session()?.status === 'CARREGANDO' ? ('whatsapp.connecting' | translate) : ('whatsapp.connect' | translate) }}
                  </button>
                }
              </div>

              <div class="mt-3.5 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-[11.5px] text-amber-700 leading-relaxed">
                {{ 'whatsapp.unofficialWarn' | translate }}
              </div>
            </div>
          </div>

          <!-- Grupos -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 class="font-display font-semibold text-[14px]">{{ 'whatsapp.groupsTitle' | translate }}</h3>
              <button (click)="loadGrupos()" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-sm" [attr.title]="'whatsapp.refreshTitle' | translate">↺</button>
            </div>
            <div class="max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain">
              @if (grupos().length === 0 && session()?.status !== 'CONECTADO') {
                <div class="px-4 py-6 text-center text-slate-400 text-[12.5px]">
                  {{ 'whatsapp.connectToSee' | translate }}
                </div>
              } @else if (grupos().length === 0) {
                <div class="px-4 py-6 text-center text-slate-400 text-[12.5px] leading-relaxed">
                  {{ 'whatsapp.noLinkedGroups' | translate }}
                </div>
              } @else {
                @for (g of grupos(); track g.id; let last = $last) {
                  <div class="flex items-center gap-3 px-4 py-3" [class]="last ? '' : 'border-b border-slate-100'">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 bg-green-100 text-green-800">
                      👥
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-semibold truncate">{{ g.nome }}</div>
                      @if (g.qtdParticipantes != null) {
                        <div class="text-[11px] text-slate-500 truncate">{{ 'whatsapp.groupMembers' | translate: { n: g.qtdParticipantes } }}</div>
                      }
                      <div class="text-[11px] text-slate-400 font-mono truncate">{{ g.id.length > 24 ? (g.id.slice(0, 24) + '…') : g.id }}</div>
                    </div>
                  </div>
                }
              }
            </div>
            @if (loadingGrupos()) {
              <div class="px-4 py-4 text-center text-[12px] text-slate-400">{{ 'whatsapp.loadingGroups' | translate }}</div>
            }
          </div>
        </aside>

        <!-- ── Main content ─────────────────────────────────────────────────── -->
        <div class="flex flex-col gap-5">

          <!-- KPIs -->
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
              <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'whatsapp.kpiSent' | translate }}</div>
              <div class="font-display text-[26px] font-semibold tracking-tight mt-1">{{ totalEnviadas() }}</div>
              <div class="text-[11.5px] text-green-700 mt-0.5">{{ 'whatsapp.kpiSuccess' | translate: { p: pctSucesso() } }}</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
              <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'whatsapp.kpiFails' | translate }}</div>
              <div class="font-display text-[26px] font-semibold tracking-tight mt-1 text-amber-600">{{ totalFalhas() }}</div>
              <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'whatsapp.kpiRetry' | translate }}</div>
            </div>
            <div class="bg-white border border-slate-200 rounded-lg p-[18px]">
              <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{{ 'whatsapp.kpiNext' | translate }}</div>
              <div class="font-display text-[26px] font-semibold tracking-tight mt-1 text-blue-600">{{ 'whatsapp.kpiNextValue' | translate }}</div>
              <div class="text-[11.5px] text-slate-400 mt-0.5">{{ 'whatsapp.kpiNextHint' | translate }}</div>
            </div>
          </div>

          <!-- Templates -->
          <div class="bg-white border border-slate-200 rounded-lg">
            <div class="px-5 py-4 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 class="font-display font-semibold text-[15px]">{{ 'whatsapp.templatesTitle' | translate }}</h3>
                <p class="text-[12px] text-slate-500 mt-1 max-w-xl">{{ 'whatsapp.templatesHint' | translate }}</p>
              </div>
              <a routerLink="/whatsapp/templates"
                 class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-12 whitespace-nowrap self-start sm:self-center">
                {{ 'whatsapp.templatesCta' | translate }}
              </a>
            </div>
            <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              @for (t of templates; track t.tipo) {
                <div class="p-3.5 border border-slate-200 rounded-xl">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[13px] font-semibold">{{ t.nomeKey | translate }}</span>
                    @if (t.auto) {
                      <span class="inline-flex items-center px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[9.5px] font-semibold rounded-full uppercase tracking-wide">{{ 'whatsapp.badgeAuto' | translate }}</span>
                    }
                  </div>
                  <div class="font-mono text-[11px] text-slate-400 leading-relaxed">{{ t.previewKey | translate }}</div>
                </div>
              }
            </div>
          </div>

          <!-- Histórico -->
          <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="font-display font-semibold text-[15px]">{{ 'whatsapp.historyTitle' | translate }}</h3>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-[13px]">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 hidden sm:table-cell">{{ 'whatsapp.thDate' | translate }}</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'whatsapp.thType' | translate }}</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'whatsapp.thContent' | translate }}</th>
                    <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5">{{ 'whatsapp.thStatus' | translate }}</th>
                    <th class="px-4 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  @if (loadingMsgs()) {
                    @for (i of [1,2,3,4]; track i) {
                      <tr class="border-b border-slate-100">
                        <td class="px-4 py-3 hidden sm:table-cell"><div class="h-4 bg-slate-100 rounded animate-pulse w-24"></div></td>
                        <td class="px-4 py-3"><div class="h-5 bg-slate-100 rounded-full animate-pulse w-20"></div></td>
                        <td class="px-4 py-3"><div class="h-4 bg-slate-100 rounded animate-pulse w-full max-w-[240px]"></div></td>
                        <td class="px-4 py-3"><div class="h-5 bg-slate-100 rounded-full animate-pulse w-16"></div></td>
                        <td></td>
                      </tr>
                    }
                  } @else if (mensagens().length === 0) {
                    <tr>
                      <td colspan="5" class="px-4 py-10 text-center text-slate-400 text-sm">{{ 'whatsapp.emptyMsgs' | translate }}</td>
                    </tr>
                  } @else {
                    @for (m of mensagens(); track m.id) {
                      <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">
                        <td class="px-4 py-3 font-mono text-[11.5px] text-slate-400 hidden sm:table-cell whitespace-nowrap">{{ fmtDt(m.criadoEm) }}</td>
                        <td class="px-4 py-3">
                          <span class="inline-flex items-center px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9.5px] font-semibold rounded uppercase tracking-wide">{{ m.tipo }}</span>
                        </td>
                        <td class="px-4 py-3 text-slate-500 text-[12px] max-w-[240px] truncate">{{ m.conteudo }}</td>
                        <td class="px-4 py-3">
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border"
                                [class]="m.status === 'ENVIADO' ? 'bg-green-50 text-green-800 border-green-200' : m.status === 'FALHA' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'">
                            <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                            @switch (m.status) {
                              @case ('PENDENTE') { {{ 'whatsapp.msgStatusPENDENTE' | translate }} }
                              @case ('ENVIADO') { {{ 'whatsapp.msgStatusENVIADO' | translate }} }
                              @case ('FALHA') { {{ 'whatsapp.msgStatusFALHA' | translate }} }
                            }
                          </span>
                        </td>
                        <td class="px-4 py-3">
                          @if (m.status === 'FALHA') {
                            <button (click)="retry(m.id)"
                                    class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[12px] font-semibold rounded-lg transition-colors">
                              {{ 'whatsapp.retryBtn' | translate }}
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
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

  private pollInterval: ReturnType<typeof setInterval> | null = null;
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
    // Polling a cada 3s quando CARREGANDO ou AGUARDANDO_QR
    this.pollInterval = setInterval(() => {
      const s = this.session()?.status;
      if (s === 'CARREGANDO' || s === 'AGUARDANDO_QR') this.loadSession();
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
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
      const filtrados = sessaoTodos.filter(g => vinculados.has(g.id));
      filtrados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }));
      this.grupos.set(filtrados);
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

  /** Encerra a sessão em espera de QR e sobe outra para emitir QR novo (evita QR expirado). */
  async renovarQr(): Promise<void> {
    if (this.session()?.status !== 'AGUARDANDO_QR' || this.acao()) return;
    this.acao.set(true);
    try {
      this.session.set(await firstValueFrom(this.api.post<SessionInfo>('/whatsapp/sessao/qr/renovar', {})));
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
