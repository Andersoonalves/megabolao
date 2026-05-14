import {
  Component, signal, computed, input, ChangeDetectionStrategy, inject, effect,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

interface Template {
  id: string;
  nome: string;
  conteudo: string;
  tipo: string;
  ativo: boolean;
}

interface Grupo {
  id: string;
  nome: string;
  qtdParticipantes?: number;
}

interface WaConfig {
  bolaoId: string;
  bolaoNome: string;
  grupos: Grupo[];
  configurado: boolean;
}

interface SessionInfo {
  status: string;
  numero?: string;
}

interface BolaoResumo {
  id: string;
  nome: string;
  status: string;
  totalCotasAtivas: number;
}

type GrupoTab = 'all' | 'bound' | 'free';

@Component({
  selector: 'nb-bolao-whatsapp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, BackButtonComponent, TranslatePipe],
  templateUrl: './bolao-whatsapp.component.html',
})
export class BolaoWhatsappComponent {
  readonly id = input<string>('');
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  readonly tabs: { k: GrupoTab; labKey: string }[] = [
    { k: 'all', labKey: 'bolaoWhatsapp.tabAll' },
    { k: 'bound', labKey: 'bolaoWhatsapp.tabBound' },
    { k: 'free', labKey: 'bolaoWhatsapp.tabFree' },
  ];

  bolao = signal<BolaoResumo | null>(null);
  config = signal<WaConfig | null>(null);
  session = signal<SessionInfo | null>(null);
  grupos = signal<Grupo[]>([]);
  loadingGrupos = signal(false);
  salvando = signal(false);
  erro = signal('');
  sucesso = signal('');

  grupoSearch = signal('');
  grupoTab = signal<GrupoTab>('bound');

  templates = signal<Template[]>([]);
  gruposEnvio = signal<string[]>([]);
  msgConteudo = signal('');
  enviando = signal(false);
  erroEnvio = signal('');
  sucessoEnvio = signal('');

  selecionados = signal<Grupo[]>([]);

  vinculadosCount = computed(() => this.selecionados().length);

  disponiveisCount = computed(() => {
    const set = new Set(this.selecionados().map(g => g.id));
    return this.grupos().filter(g => !set.has(g.id)).length;
  });

  gruposExibidos = computed(() => {
    const all = this.grupos();
    const q = this.grupoSearch().trim().toLowerCase();
    let list = q
      ? all.filter(g => g.nome.toLowerCase().includes(q) || g.id.toLowerCase().includes(q))
      : [...all];
    const sel = new Set(this.selecionados().map(g => g.id));
    const tab = this.grupoTab();
    if (tab === 'bound') list = list.filter(g => sel.has(g.id));
    if (tab === 'free') list = list.filter(g => !sel.has(g.id));
    return list;
  });

  alterado = computed(() => {
    const salvo = (this.config()?.grupos ?? [])
      .map(g => g.id)
      .sort()
      .join(',');
    const atual = this.selecionados()
      .map(g => g.id)
      .sort()
      .join(',');
    return salvo !== atual;
  });

  constructor() {
    effect(() => {
      const bid = this.id();
      if (!bid) return;
      void this.loadAll(bid);
    });
  }

  tabCount(k: GrupoTab): number {
    const sel = new Set(this.selecionados().map(g => g.id));
    const all = this.grupos();
    const q = this.grupoSearch().trim().toLowerCase();
    const base = q
      ? all.filter(g => g.nome.toLowerCase().includes(q) || g.id.toLowerCase().includes(q))
      : [...all];
    if (k === 'all') return base.length;
    if (k === 'bound') return base.filter(g => sel.has(g.id)).length;
    return base.filter(g => !sel.has(g.id)).length;
  }

  emptyFilterMessage(): string {
    if (this.grupos().length === 0) return this.translate.instant('bolaoWhatsapp.emptyNoGroups');
    return this.translate.instant('bolaoWhatsapp.emptyFilter');
  }

  statusLabel(): string {
    const s = this.bolao()?.status;
    if (!s) return '';
    const k = `bolaoWhatsapp.status.${s}`;
    const t = this.translate.instant(k);
    return t !== k ? t : s;
  }

  private async loadAll(bid: string): Promise<void> {
    await Promise.all([this.loadBolao(bid), this.loadConfig(), this.loadSession(), this.loadTemplates()]);
  }

  private async loadBolao(bid: string): Promise<void> {
    try {
      this.bolao.set(await firstValueFrom(this.api.get<BolaoResumo>(`/boloes/${bid}`)));
    } catch {
      this.bolao.set(null);
    }
  }

  private async loadConfig(): Promise<void> {
    const bid = this.id();
    if (!bid) return;
    try {
      const c = await firstValueFrom(this.api.get<WaConfig>(`/boloes/${bid}/whatsapp`));
      this.config.set(c);
      this.selecionados.set([...c.grupos]);
      this.gruposEnvio.set(c.grupos.map(g => g.id));
    } catch {
      /* silencioso */
    }
  }

  private async loadTemplates(): Promise<void> {
    try {
      const ts = await firstValueFrom(this.api.get<Template[]>('/whatsapp/templates'));
      this.templates.set(ts.filter(t => t.ativo));
    } catch {
      /* silencioso */
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const s = await firstValueFrom(this.api.get<SessionInfo>('/whatsapp/sessao/status'));
      this.session.set(s);
      if (s.status === 'CONECTADO') await this.loadGrupos();
    } catch {
      /* silencioso */
    }
  }

  async loadGrupos(): Promise<void> {
    this.loadingGrupos.set(true);
    try {
      const g = await firstValueFrom(this.api.get<Grupo[]>('/whatsapp/sessao/grupos'));
      this.grupos.set(g);
    } catch {
      /* silencioso */
    } finally {
      this.loadingGrupos.set(false);
    }
  }

  async syncGrupos(): Promise<void> {
    await this.loadGrupos();
    await this.loadSession();
  }

  estaSelecionado(id: string): boolean {
    return this.selecionados().some(g => g.id === id);
  }

  toggleGrupo(g: Grupo): void {
    this.selecionados.update(atual =>
      this.estaSelecionado(g.id) ? atual.filter(x => x.id !== g.id) : [...atual, g],
    );
  }

  async salvar(): Promise<void> {
    if (!this.alterado() || this.salvando()) return;
    const bid = this.id();
    if (!bid) return;
    this.salvando.set(true);
    this.erro.set('');
    this.sucesso.set('');
    try {
      const c = await firstValueFrom(
        this.api.patch<WaConfig>(`/boloes/${bid}/whatsapp`, {
          grupos: this.selecionados().map(({ id, nome }) => ({ id, nome })),
        }),
      );
      this.config.set(c);
      const n = c.grupos.length;
      this.sucesso.set(
        n > 0
          ? this.translate.instant('bolaoWhatsapp.saveOk', { n })
          : this.translate.instant('bolaoWhatsapp.saveEmpty'),
      );
      setTimeout(() => this.sucesso.set(''), 3000);
    } catch (err: unknown) {
      this.erro.set((err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('bolaoWhatsapp.saveErr'));
    } finally {
      this.salvando.set(false);
    }
  }

  toggleGrupoEnvio(grupoId: string): void {
    this.gruposEnvio.update(ids =>
      ids.includes(grupoId) ? ids.filter(x => x !== grupoId) : [...ids, grupoId],
    );
  }

  aplicarTemplate(event: Event): void {
    const tid = (event.target as HTMLSelectElement).value;
    if (!tid) return;
    const t = this.templates().find(x => x.id === tid);
    if (t) this.msgConteudo.set(t.conteudo);
  }

  async enviarMensagem(): Promise<void> {
    const bid = this.id();
    if (!bid || !this.msgConteudo().trim() || this.gruposEnvio().length === 0 || this.enviando()) return;
    this.enviando.set(true);
    this.erroEnvio.set('');
    this.sucessoEnvio.set('');
    try {
      for (const grupoId of this.gruposEnvio()) {
        await firstValueFrom(
          this.api.post('/whatsapp/mensagens', {
            grupoId,
            tipo: 'MANUAL',
            conteudo: this.msgConteudo().trim(),
            bolaoId: bid,
          }),
        );
      }
      this.sucessoEnvio.set(this.translate.instant('bolaoWhatsapp.sendOk', { n: this.gruposEnvio().length }));
      this.msgConteudo.set('');
      setTimeout(() => this.sucessoEnvio.set(''), 4000);
    } catch (err: unknown) {
      this.erroEnvio.set(
        (err as { error?: { message?: string } })?.error?.message ?? this.translate.instant('bolaoWhatsapp.sendErr'),
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
