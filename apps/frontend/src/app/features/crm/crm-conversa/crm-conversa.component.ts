import {
  Component, signal, input, effect, ChangeDetectionStrategy, inject,
  ViewChild, ElementRef, AfterViewChecked, OnDestroy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

interface Etapa { id: string; nome: string; cor: string; }

interface Bolao { id: string; nome: string; status: string; }

interface Cota {
  id: string;
  numeroSequencial: number;
  statusPagamento: string;
  bolao: Bolao;
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

@Component({
  selector: 'nb-crm-conversa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, FormsModule, DatePipe, TranslatePipe],
  templateUrl: './crm-conversa.component.html',
})
export class CrmConversaComponent implements AfterViewChecked, OnDestroy {
  readonly celular = input<string>('');

  @ViewChild('msgContainer') msgContainer!: ElementRef<HTMLDivElement>;

  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  contato    = signal<Contato | null>(null);
  mensagens  = signal<Mensagem[]>([]);
  etapas     = signal<Etapa[]>([]);
  loading    = signal(true);
  sending    = signal(false);
  error      = signal('');
  texto      = signal('');
  modoEnvio  = signal<'OUT' | 'NOTE'>('OUT');
  pagandoId  = signal('');

  private shouldScroll = false;
  private pollMensagens: ReturnType<typeof setInterval> | null = null;

  /** Celular canônico do contato (URL pode diferir do valor no banco). */
  private celularApi(): string {
    const raw = this.contato()?.celular ?? this.celular();
    return encodeURIComponent(raw);
  }

  constructor() {
    effect(() => {
      const cel = this.celular();
      if (this.pollMensagens) {
        clearInterval(this.pollMensagens);
        this.pollMensagens = null;
      }
      if (!cel) return;
      void this.load();
      this.pollMensagens = setInterval(() => void this.pollNovasMensagens(), 4000);
    });
  }

  ngOnDestroy(): void {
    if (this.pollMensagens) clearInterval(this.pollMensagens);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.msgContainer) {
      this.msgContainer.nativeElement.scrollTop = this.msgContainer.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
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
        this.api.get<Mensagem[]>(
          `/crm/contatos/${encodeURIComponent(contato.celular)}/mensagens`,
        ),
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

  /** Atualiza thread sem spinner (mensagens recebidas via webhook). */
  private async pollNovasMensagens(): Promise<void> {
    if (!this.celular() || this.loading() || this.sending()) return;
    try {
      const msgs = await firstValueFrom(
        this.api.get<Mensagem[]>(`/crm/contatos/${this.celularApi()}/mensagens`),
      );
      const prev = this.mensagens();
      const prevIds = new Set(prev.map(m => m.id));
      const hasNew = msgs.some(m => !prevIds.has(m.id));
      if (hasNew || msgs.length !== prev.length) {
        this.mensagens.set(msgs);
        this.shouldScroll = true;
        if (msgs.some(m => m.direcao === 'IN' && !m.lida)) {
          this.api.patch(`/crm/contatos/${this.celularApi()}/mensagens/marcar-lidas`, {}).subscribe();
        }
      }
    } catch {
      /* silencioso no poll */
    }
  }

  async enviar(): Promise<void> {
    const t = this.texto().trim();
    if (!t || this.sending()) return;
    this.sending.set(true);
    try {
      const m = await firstValueFrom(
        this.api.post<Mensagem>(`/crm/contatos/${this.celularApi()}/mensagens`, {
          conteudo: t,
          direcao: this.modoEnvio(),
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

  async moverEtapa(etapaId: string): Promise<void> {
    try {
      const c = await firstValueFrom(
        this.api.patch<Contato>(`/crm/contatos/${this.celularApi()}`, { etapaId }),
      );
      this.contato.set(c);
    } catch { /* silencioso */ }
  }

  async pagarCota(cotaId: string): Promise<void> {
    if (this.pagandoId()) return;
    this.pagandoId.set(cotaId);
    try {
      const updated = await firstValueFrom(
        this.api.patch<{ id: string; statusPagamento: string }>
          (`/crm/contatos/${this.celularApi()}/mensagens/cotas/${cotaId}/pagar`, {}),
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
      this.enviar();
    }
  }

  fmtHora(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  nomeDisplay(c: Contato): string {
    return c.nome ?? c.participante?.nome ?? c.celular;
  }

  statusClass(s: string): string {
    if (s === 'PAGO')    return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'PENDENTE') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}
