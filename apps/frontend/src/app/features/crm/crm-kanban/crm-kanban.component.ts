import {
  Component, signal, computed, ChangeDetectionStrategy, inject, OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

interface Etapa {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  isSistema: boolean;
}

interface Cota {
  id: string;
  numeroSequencial: number;
  statusPagamento: string;
  bolao: { id: string; nome: string; status: string };
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

@Component({
  selector: 'nb-crm-kanban',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, DragDropModule, TranslatePipe],
  templateUrl: './crm-kanban.component.html',
})
export class CrmKanbanComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  etapas   = signal<Etapa[]>([]);
  contatos = signal<Contato[]>([]);
  loading  = signal(true);
  error    = signal('');
  busca    = signal('');

  novoContato = signal(false);
  novoCelular = '';
  novoNome    = '';
  novoEtapaId = '';
  criando     = signal(false);
  importando  = signal(false);
  importMsg   = signal('');

  private readonly PAGE_SIZE = 30;

  /** Quantos itens mostrar por coluna. Cresce ao clicar "Mostrar mais". */
  paginacao = signal<Record<string, number>>({});

  contatosPorEtapa = computed(() => {
    const b = this.busca().toLowerCase();
    const todos = this.contatos().filter(c =>
      !b || (c.nome ?? c.celular).toLowerCase().includes(b) || c.celular.includes(b),
    );
    const map: Record<string, Contato[]> = {};
    for (const e of this.etapas()) map[e.id] = [];
    for (const c of todos) {
      if (c.etapaId) (map[c.etapaId] ??= []).push(c);
    }
    return map;
  });

  /** Contatos visíveis (paginados) por coluna. */
  contatosVisiveis = computed(() => {
    const todos = this.contatosPorEtapa();
    const pag   = this.paginacao();
    const result: Record<string, Contato[]> = {};
    for (const key of Object.keys(todos)) {
      const limite = pag[key] ?? this.PAGE_SIZE;
      result[key] = todos[key].slice(0, limite);
    }
    return result;
  });

  listaIds = computed(() => this.etapas().map(e => e.id));

  mostrarMais(etapaId: string): void {
    this.paginacao.update(p => ({
      ...p,
      [etapaId]: (p[etapaId] ?? this.PAGE_SIZE) + this.PAGE_SIZE,
    }));
  }

  temMais(etapaId: string): boolean {
    const total   = (this.contatosPorEtapa()[etapaId] ?? []).length;
    const visivel = (this.paginacao()[etapaId] ?? this.PAGE_SIZE);
    return total > visivel;
  }

  onColumnScroll(event: Event, etapaId: string): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (nearBottom && this.temMais(etapaId)) this.mostrarMais(etapaId);
  }

  // ── Criar etapa inline ─────────────────────────────────────────────────────
  adicionandoEtapa = signal(false);
  novaEtapaNome    = '';
  novaEtapaCor     = '#3b82f6';
  criandoEtapa     = signal(false);

  readonly coresEtapa = ['#64748b','#3b82f6','#f59e0b','#ef4444','#22c55e','#8b5cf6','#ec4899','#14b8a6'];

  async criarEtapaInline(): Promise<void> {
    if (!this.novaEtapaNome.trim() || this.criandoEtapa()) return;
    this.criandoEtapa.set(true);
    try {
      await firstValueFrom(this.api.post('/crm/etapas', {
        nome: this.novaEtapaNome.trim(),
        cor:  this.novaEtapaCor,
      }));
      this.novaEtapaNome = '';
      this.novaEtapaCor  = '#3b82f6';
      this.adicionandoEtapa.set(false);
      await this.load();
    } catch {
      this.error.set(this.translate.instant('crm.errSave'));
    } finally {
      this.criandoEtapa.set(false);
    }
  }

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await firstValueFrom(
        this.api.get<{ etapas: Etapa[]; contatos: Contato[] }>('/crm/contatos/kanban'),
      );
      this.etapas.set(d.etapas);
      this.contatos.set(d.contatos);
    } catch {
      this.error.set(this.translate.instant('crm.errLoad'));
    } finally {
      this.loading.set(false);
    }
  }

  async onDrop(event: CdkDragDrop<Contato[]>, novaEtapaId: string | null): Promise<void> {
    const contato: Contato = event.previousContainer.data[event.previousIndex];
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    // Otimista — atualiza localmente, confirma no servidor
    this.contatos.update(cs =>
      cs.map(c => c.id === contato.id ? { ...c, etapaId: novaEtapaId } : c),
    );
    try {
      await firstValueFrom(
        this.api.patch(`/crm/contatos/${contato.celular}`, {
          etapaId: novaEtapaId,
        }),
      );
    } catch {
      // Reverter em caso de erro
      this.load();
    }
  }

  async criarContato(): Promise<void> {
    if (!this.novoCelular.trim() || this.criando()) return;
    this.criando.set(true);
    try {
      const c = await firstValueFrom(
        this.api.post<Contato>('/crm/contatos', {
          celular: this.novoCelular.trim(),
          nome:    this.novoNome.trim() || undefined,
          etapaId: this.novoEtapaId || undefined,
        }),
      );
      this.contatos.update(cs => [c, ...cs]);
      this.novoCelular = '';
      this.novoNome    = '';
      this.novoEtapaId = '';
      this.novoContato.set(false);
    } catch {
      this.error.set(this.translate.instant('crm.errCreate'));
    } finally {
      this.criando.set(false);
    }
  }

  async importarParticipantes(): Promise<void> {
    if (this.importando()) return;
    this.importando.set(true);
    this.importMsg.set('');
    try {
      const r = await firstValueFrom(
        this.api.post<{ importados: number; total: number }>('/crm/contatos/importar-participantes', {}),
      );
      this.importMsg.set(this.translate.instant('crm.importMsg', r));
      await this.load();
    } catch {
      this.importMsg.set(this.translate.instant('crm.errImport'));
    } finally {
      this.importando.set(false);
    }
  }

  abrirConversa(celular: string): void {
    this.router.navigate(['/crm/conversa', celular]);
  }

  nomeDisplay(c: Contato): string {
    return c.nome ?? c.participante?.nome ?? c.celular;
  }

  cotasPendentes(c: Contato): number {
    return c.participante?.cotas.filter(x => x.statusPagamento === 'PENDENTE').length ?? 0;
  }

  totalCotas(c: Contato): number {
    return c.participante?.cotas.length ?? 0;
  }
}
