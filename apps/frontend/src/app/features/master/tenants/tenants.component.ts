import {
  Component, signal, computed, OnInit, ChangeDetectionStrategy, inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../../core/services/api.service';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

interface TenantResponse {
  id: string; nome: string; slug: string;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  taxaAdministrativaPct: number;
  branding: { corPrimaria?: string; logoUrl?: string; nomeCustomizado?: string } | null;
  criadoEm: string; atualizadoEm: string;
}
interface Paginated<T> { data: T[]; total: number; page: number; totalPages: number; }

// ── Utilitários de cor ────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

@Component({
  selector: 'nb-tenants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, RouterLink, FormsModule, TranslatePipe],
  templateUrl: './tenants.component.html',
})
export class TenantsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  // ── List state ──────────────────────────────────────────────────────────────
  tenants    = signal<TenantResponse[]>([]);
  loading    = signal(false);
  error      = signal('');
  total      = signal(0);
  totalPages = signal(1);
  page       = signal(1);

  // ── Edit state ──────────────────────────────────────────────────────────────
  editando        = signal<TenantResponse | null>(null);
  editNome        = signal('');
  editSlug        = signal('');
  editTaxa        = signal(15);
  editStatus      = signal<TenantResponse['status']>('ATIVO');
  editCor         = signal('#047857');
  editNomeCustom  = signal('');
  editLoading     = signal(false);
  editError       = signal('');
  mostrarSenha    = signal(false);
  editAdminSenha  = signal('');
  editConfirmarSenha = signal('');
  editSenhaError  = signal('');

  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.api.get<Paginated<TenantResponse>>(`/tenants?page=${this.page()}&perPage=20`),
      );
      this.tenants.set(res.data);
      this.total.set(res.total);
      this.totalPages.set(res.totalPages);
    } catch (err: unknown) {
      type HttpErr = { error?: { message?: string }; status?: number };
      const e = err as HttpErr;
      const status = e.status ? ` [${e.status}]` : '';
      this.error.set(e.error?.message ?? `${this.translate.instant('tenants.errLoad')}${status}`);
      this.tenants.set(DEMO_TENANTS);
      this.total.set(DEMO_TENANTS.length);
    } finally { this.loading.set(false); }
  }

  // ── Edição ──────────────────────────────────────────────────────────────────
  abrirEdicao(t: TenantResponse): void {
    this.editando.set(t);
    this.editNome.set(t.nome);
    this.editSlug.set(t.slug);
    this.editTaxa.set(t.taxaAdministrativaPct);
    this.editStatus.set(t.status);
    this.editCor.set(t.branding?.corPrimaria ?? '#047857');
    this.editNomeCustom.set(t.branding?.nomeCustomizado ?? '');
    this.editError.set('');
    this.mostrarSenha.set(false);
    this.editAdminSenha.set('');
    this.editConfirmarSenha.set('');
    this.editSenhaError.set('');
  }

  fecharEdicao(): void { this.editando.set(null); }

  async salvarEdicao(): Promise<void> {
    const t = this.editando();
    if (!t || this.editLoading()) return;

    this.editSenhaError.set('');
    if (this.mostrarSenha() && this.editAdminSenha()) {
      if (this.editAdminSenha().length < 8) {
        this.editSenhaError.set(this.translate.instant('tenants.errSenhaMin'));
        return;
      }
      if (this.editAdminSenha() !== this.editConfirmarSenha()) {
        this.editSenhaError.set(this.translate.instant('tenants.errSenhaMismatch'));
        return;
      }
    }

    this.editLoading.set(true);
    this.editError.set('');
    try {
      const updated = await firstValueFrom(
        this.api.patch<TenantResponse>(`/tenants/${t.id}`, {
          nome:                 this.editNome(),
          slug:                 this.editSlug(),
          taxaAdministrativaPct: this.editTaxa(),
          status:               this.editStatus(),
          branding: {
            corPrimaria:    this.editCor(),
            ...(this.editNomeCustom() && { nomeCustomizado: this.editNomeCustom() }),
          },
        }),
      );

      if (this.mostrarSenha() && this.editAdminSenha()) {
        await firstValueFrom(
          this.api.patch(`/tenants/${t.id}/admin-senha`, { novaSenha: this.editAdminSenha() }),
        );
      }

      // Atualização otimista da lista
      this.tenants.update(ts => ts.map(x => x.id === t.id ? updated : x));
      this.fecharEdicao();
    } catch (err: unknown) {
      type HttpErr = { error?: { message?: string }; status?: number };
      const e = err as HttpErr;
      const status = e.status ? ` [${e.status}]` : '';
      this.editError.set(e.error?.message ?? `${this.translate.instant('tenants.errSave')}${status}`);
    } finally {
      this.editLoading.set(false);
    }
  }

  async toggleStatus(t: TenantResponse): Promise<void> {
    const novoStatus: TenantResponse['status'] = t.status === 'ATIVO' ? 'SUSPENSO' : 'ATIVO';
    try {
      await firstValueFrom(this.api.patch(`/tenants/${t.id}`, { status: novoStatus }));
      this.tenants.update(ts => ts.map(x => x.id === t.id ? { ...x, status: novoStatus } : x));
    } catch { this.error.set(this.translate.instant('tenants.errToggle')); }
  }

  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); } }

  // ── Helpers de cor (usa rgba para compatibilidade) ──────────────────────────
  private getCor(t: TenantResponse): string | null {
    return t.branding?.corPrimaria ?? null;
  }

  brandBg(t: TenantResponse): string {
    const cor = this.getCor(t);
    return cor ? hexToRgba(cor, 0.12) : '#f1f5f9';
  }

  brandColor(t: TenantResponse): string {
    return this.getCor(t) ?? '#334155';
  }

  brandBorderColor(t: TenantResponse): string {
    const cor = this.getCor(t);
    return cor ? hexToRgba(cor, 0.25) : '#e2e8f0';
  }

  brandBgFromColor(cor: string): string {
    try { return hexToRgba(cor, 0.12); } catch { return '#f1f5f9'; }
  }

  statusClass(s: string): string {
    if (s === 'ATIVO')    return 'bg-green-50 text-green-800 border-green-200';
    if (s === 'SUSPENSO') return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-red-50 text-red-700 border-red-200';
  }

  initials(nome: string): string {
    return (nome || '?').split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }

  fmtDate(iso: string): string {
    const loc = this.translate.currentLang?.startsWith('en') ? 'en-US' : 'pt-BR';
    try { return new Date(iso).toLocaleDateString(loc, { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return this.translate.instant('common.emDash'); }
  }

  tenantStatusKey(s: TenantResponse['status']): string {
    if (s === 'ATIVO') return 'tenants.statusATIVO';
    if (s === 'SUSPENSO') return 'tenants.statusSUSPENSO';
    return 'tenants.statusINATIVO';
  }

  toggleStatusTitle(t: TenantResponse): string {
    return t.status === 'ATIVO'
      ? this.translate.instant('tenants.titleSuspend')
      : this.translate.instant('tenants.titleActivate');
  }
}

// ── Demo fallback ─────────────────────────────────────────────────────────────

const DEMO_TENANTS: TenantResponse[] = [
  { id: '1', nome: 'Bolão CG',        slug: 'bolao-cg',        status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#047857' }, criadoEm: '2026-01-10T00:00:00Z', atualizadoEm: '' },
  { id: '2', nome: 'Loteria do João', slug: 'joao-loto',        status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#2563eb' }, criadoEm: '2026-02-05T00:00:00Z', atualizadoEm: '' },
  { id: '3', nome: 'Sorte Total RJ',  slug: 'sorte-total-rj',   status: 'ATIVO',    taxaAdministrativaPct: 20, branding: { corPrimaria: '#7c3aed' }, criadoEm: '2026-02-18T00:00:00Z', atualizadoEm: '' },
  { id: '4', nome: 'Mega Vizinhos',   slug: 'mega-vizinhos',    status: 'SUSPENSO', taxaAdministrativaPct: 15, branding: null,                       criadoEm: '2026-03-01T00:00:00Z', atualizadoEm: '' },
  { id: '5', nome: 'Bolão da Firma',  slug: 'bolao-firma',      status: 'ATIVO',    taxaAdministrativaPct: 15, branding: { corPrimaria: '#d97706' }, criadoEm: '2026-03-15T00:00:00Z', atualizadoEm: '' },
  { id: '6', nome: 'Trevo da Sorte',  slug: 'trevo',            status: 'INATIVO',  taxaAdministrativaPct: 15, branding: null,                       criadoEm: '2026-04-01T00:00:00Z', atualizadoEm: '' },
];
