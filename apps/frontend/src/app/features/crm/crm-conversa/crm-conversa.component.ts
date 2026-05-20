import {
  Component, signal, input, effect, computed,
  ChangeDetectionStrategy, inject,
  ViewChild, ElementRef, AfterViewChecked, OnDestroy, HostListener,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';

interface Etapa { id: string; nome: string; cor: string; }

interface Bolao { id: string; nome: string; status: string; }

interface Cota {
  id: string;
  numeroSequencial: number;
  statusPagamento: string;
  bolao: Bolao;
  palpites?: number[];
}

interface Contato {
  id: string;
  celular: string;
  nome: string | null;
  etapaId: string | null;
  tags: string[];
  notas: string | null;
  etapa: Etapa | null;
  participante: {
    id: string;
    nome: string;
    cotas: Cota[];
  } | null;
}

interface Mensagem {
  id: string;
  celular: string;
  direcao: 'IN' | 'OUT' | 'NOTE';
  conteudo: string;
  tipo: string;
  lida: boolean;
  criadoEm: string;
}

interface UltimaMensagem {
  conteudo: string;
  direcao: string;
  tipo: string;
  criado_em: string;
}

interface ContatoPreview {
  id: string;
  celular: string;
  nome: string | null;
  etapa: Etapa | null;
  ultimaMensagem: UltimaMensagem | null;
  naoLidas: number;
  atualizadoEm: string;
}

interface MsgGroup { label: string; msgs: Mensagem[]; }

@Component({
  selector: 'nb-crm-conversa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, FormsModule, TranslatePipe, ConfirmModalComponent],
  templateUrl: './crm-conversa.component.html',
})
export class CrmConversaComponent implements AfterViewChecked, OnDestroy {
  readonly celular = input<string>('');

  @ViewChild('msgContainer') msgContainer!: ElementRef<HTMLDivElement>;

  private readonly api    = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  contato      = signal<Contato | null>(null);
  mensagens    = signal<Mensagem[]>([]);
  etapas       = signal<Etapa[]>([]);
  lista        = signal<ContatoPreview[]>([]);
  loading      = signal(true);
  loadingLista = signal(true);
  sending      = signal(false);
  error        = signal('');
  texto        = signal('');
  modoEnvio    = signal<'OUT' | 'NOTE'>('OUT');
  pagandoId        = signal('');
  lightboxSrc      = signal<string | null>(null);
  confirmEtapaOpen  = signal(false);
  confirmEtapaId    = signal<string | null>(null);
  etapaSelectValue  = signal('');
  busca        = signal('');
  filtro       = signal<'all'|'nao'|'aguar'|'sem'>('all');

  private shouldScroll = false;
  private pollMensagens: ReturnType<typeof setInterval> | null = null;
  private pollLista: ReturnType<typeof setInterval> | null = null;

  listaFiltrada = computed(() => {
    const b = this.busca().toLowerCase();
    const f = this.filtro();
    return this.lista().filter(c => {
      if (b && !((c.nome ?? c.celular).toLowerCase().includes(b) || c.celular.includes(b))) return false;
      if (f === 'nao') return c.naoLidas > 0;
      if (f === 'aguar') return c.etapa?.nome?.toLowerCase().includes('aguard') ?? false;
      if (f === 'sem') return c.ultimaMensagem?.direcao === 'IN';
      return true;
    });
  });

  groupedMensagens = computed<MsgGroup[]>(() => {
    const msgs = this.mensagens();
    const groups: MsgGroup[] = [];
    let lastLabel = '';
    for (const m of msgs) {
      const label = this.fmtDia(m.criadoEm);
      if (label !== lastLabel) {
        groups.push({ label, msgs: [] });
        lastLabel = label;
      }
      groups[groups.length - 1].msgs.push(m);
    }
    return groups;
  });

  private celularApi(): string {
    return encodeURIComponent(this.contato()?.celular ?? this.celular());
  }

  constructor() {
    // Sincroniza select com etapa real do contato (inclui reset após cancelar)
    effect(() => {
      this.etapaSelectValue.set(this.contato()?.etapaId ?? '');
    });

    effect(() => {
      const cel = this.celular();
      if (this.pollMensagens) clearInterval(this.pollMensagens);
      if (!cel) return;
      void this.load();
      this.pollMensagens = setInterval(() => void this.pollNovasMensagens(), 4000);
    });
    void this.carregarLista();
    this.pollLista = setInterval(() => void this.carregarLista(), 15_000);
  }

  ngOnDestroy(): void {
    if (this.pollMensagens) clearInterval(this.pollMensagens);
    if (this.pollLista) clearInterval(this.pollLista);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.msgContainer) {
      this.msgContainer.nativeElement.scrollTop = this.msgContainer.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  private async carregarLista(): Promise<void> {
    try {
      const data = await firstValueFrom(this.api.get<ContatoPreview[]>('/crm/contatos/lista-preview'));
      this.lista.set(data);
    } catch { /* silencioso */ }
    finally { this.loadingLista.set(false); }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const celPath = encodeURIComponent(this.celular());
      const [contato, etapas] = await Promise.all([
        firstValueFrom(this.api.get<Contato>(`/crm/contatos/${celPath}`)),
        firstValueFrom(this.api.get<Etapa[]>('/crm/etapas')),
      ]);
      this.contato.set(contato);
      const msgs = await firstValueFrom(
        this.api.get<Mensagem[]>(`/crm/contatos/${encodeURIComponent(contato.celular)}/mensagens`),
      );
      this.mensagens.set(msgs);
      this.etapas.set(etapas);
      this.shouldScroll = true;
      this.api.patch(`/crm/contatos/${this.celularApi()}/mensagens/marcar-lidas`, {}).subscribe();
    } catch {
      this.error.set(this.translate.instant('crm.errLoad'));
    } finally {
      this.loading.set(false);
    }
  }

  private async pollNovasMensagens(): Promise<void> {
    if (!this.celular() || this.loading() || this.sending()) return;
    try {
      const msgs = await firstValueFrom(this.api.get<Mensagem[]>(`/crm/contatos/${this.celularApi()}/mensagens`));
      const prev = this.mensagens();
      const prevIds = new Set(prev.map(m => m.id));
      if (msgs.some(m => !prevIds.has(m.id)) || msgs.length !== prev.length) {
        this.mensagens.set(msgs);
        this.shouldScroll = true;
        if (msgs.some(m => m.direcao === 'IN' && !m.lida)) {
          this.api.patch(`/crm/contatos/${this.celularApi()}/mensagens/marcar-lidas`, {}).subscribe();
        }
      }
    } catch { /* silencioso */ }
  }

  selecionarContato(cel: string): void {
    void this.router.navigate(['/crm/conversa', cel]);
  }

  async enviar(): Promise<void> {
    const t = this.texto().trim();
    if (!t || this.sending()) return;
    this.sending.set(true);
    try {
      const m = await firstValueFrom(
        this.api.post<Mensagem>(`/crm/contatos/${this.celularApi()}/mensagens`, {
          conteudo: t, direcao: this.modoEnvio(),
        }),
      );
      this.mensagens.update(ms => [...ms, m]);
      this.texto.set('');
      this.shouldScroll = true;
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.error.set(e.error?.message ?? this.translate.instant('crm.errSend'));
    } finally {
      this.sending.set(false);
    }
  }

  pedirConfirmacaoEtapa(etapaId: string): void {
    const atual = this.contato()?.etapaId;
    if (!etapaId || etapaId === atual) return;
    this.confirmEtapaId.set(etapaId);
    this.confirmEtapaOpen.set(true);
  }

  cancelarMoverEtapa(): void {
    this.confirmEtapaOpen.set(false);
    this.confirmEtapaId.set(null);
    // Reverte select para valor atual do contato
    this.etapaSelectValue.set(this.contato()?.etapaId ?? '');
  }

  async moverEtapa(): Promise<void> {
    const etapaId = this.confirmEtapaId();
    this.confirmEtapaOpen.set(false);
    this.confirmEtapaId.set(null);
    if (!etapaId) return;
    try {
      const c = await firstValueFrom(
        this.api.patch<Contato>(`/crm/contatos/${this.celularApi()}`, { etapaId }),
      );
      this.contato.set(c);
    } catch { /* silencioso */ }
  }

  confirmEtapaNome(): string {
    const id = this.confirmEtapaId();
    return this.etapas().find(e => e.id === id)?.nome ?? '';
  }

  etapaAtualDo(etapaId: string | null): Etapa | null {
    if (!etapaId) return null;
    return this.etapas().find(e => e.id === etapaId) ?? null;
  }

  async pagarCota(cotaId: string): Promise<void> {
    if (this.pagandoId()) return;
    this.pagandoId.set(cotaId);
    try {
      const updated = await firstValueFrom(
        this.api.patch<{ id: string; statusPagamento: string }>(
          `/crm/contatos/${this.celularApi()}/mensagens/cotas/${cotaId}/pagar`, {},
        ),
      );
      this.contato.update(c => {
        if (!c?.participante) return c;
        return {
          ...c,
          participante: {
            ...c.participante,
            cotas: c.participante.cotas.map(x =>
              x.id === cotaId ? { ...x, statusPagamento: updated.statusPagamento } : x,
            ),
          },
        };
      });
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.error.set(e.error?.message ?? this.translate.instant('crm.errPay'));
    } finally {
      this.pagandoId.set('');
    }
  }

  onEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.enviar();
    }
  }

  abrirLightbox(src: string): void { this.lightboxSrc.set(src); }
  fecharLightbox(): void { this.lightboxSrc.set(null); }

  baixarImagem(): void {
    const src = this.lightboxSrc();
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `imagem-${Date.now()}.jpg`;
    a.click();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.fecharLightbox(); }

  nomeDisplay(c: Contato | ContatoPreview): string {
    if ('participante' in c && c.participante) return c.participante.nome;
    return c.nome ?? c.celular;
  }

  iniciais(c: Contato | ContatoPreview): string {
    const n = this.nomeDisplay(c);
    return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  avatarColor(cel: string): string {
    const colors = ['#1F4E79','#047857','#b45309','#7c3aed','#0e7490','#be123c','#0369a1'];
    let h = 0;
    for (let i = 0; i < cel.length; i++) h = cel.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  etapaColor(cor: string): { bg: string; bd: string } {
    return { bg: `${cor}18`, bd: `${cor}55` };
  }

  etapaPagoId(): string | undefined {
    return this.etapas().find(e => e.nome.toLowerCase().includes('pago'))?.id;
  }

  etapaIsPast(etapaId: string | null, index: number): boolean {
    const activeIdx = this.etapas().findIndex(e => e.id === etapaId);
    return activeIdx > index;
  }

  cotaPendente(): Cota | undefined {
    return this.contato()?.participante?.cotas.find(c => c.statusPagamento === 'PENDENTE');
  }

  fmtHora(iso: string): string {
    try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  fmtDia(iso: string): string {
    const d = new Date(iso);
    const hoje = new Date();
    const diff = Math.floor((hoje.setHours(0,0,0,0) - d.setHours(0,0,0,0)) / 86_400_000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff === 2) return 'Anteontem';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  previewConteudo(m: UltimaMensagem | null): string {
    if (!m) return '';
    if (m.tipo === 'image') return '📷 Imagem';
    if (m.tipo === 'audio') return '🎤 Áudio';
    if (m.tipo === 'document') return '📄 Documento';
    return m.conteudo.slice(0, 45);
  }

  statusClass(s: string): string {
    if (s === 'PAGO')    return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'PENDENTE') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}
