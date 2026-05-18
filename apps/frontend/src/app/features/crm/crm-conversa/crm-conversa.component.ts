import {
  Component, signal, input, effect, ChangeDetectionStrategy, inject,
  ViewChild, ElementRef, AfterViewChecked,
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
export class CrmConversaComponent implements AfterViewChecked {
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

  constructor() {
    effect(() => { if (this.celular()) this.load(); });
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
      const [contato, msgs, etapas] = await Promise.all([
        firstValueFrom(this.api.get<Contato>(`/crm/contatos/${this.celular()}`)),
        firstValueFrom(this.api.get<Mensagem[]>(`/crm/contatos/${this.celular()}/mensagens`)),
        firstValueFrom(this.api.get<Etapa[]>('/crm/etapas')),
      ]);
      this.contato.set(contato);
      this.mensagens.set(msgs);
      this.etapas.set(etapas);
      this.shouldScroll = true;
      // Marcar como lidas
      this.api.patch(`/crm/contatos/${this.celular()}/mensagens/marcar-lidas`, {}).subscribe();
    } catch {
      this.error.set(this.translate.instant('crm.errLoad'));
    } finally {
      this.loading.set(false);
    }
  }

  async enviar(): Promise<void> {
    const t = this.texto().trim();
    if (!t || this.sending()) return;
    this.sending.set(true);
    try {
      const m = await firstValueFrom(
        this.api.post<Mensagem>(`/crm/contatos/${this.celular()}/mensagens`, {
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
        this.api.patch<Contato>(`/crm/contatos/${this.celular()}`, { etapaId }),
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
          (`/crm/contatos/${this.celular()}/mensagens/cotas/${cotaId}/pagar`, {}),
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
