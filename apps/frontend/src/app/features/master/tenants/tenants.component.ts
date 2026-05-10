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
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="hidden sm:flex items-center gap-2 text-[12.5px]">
        <span class="text-slate-400">{{ 'tenants.breadcrumbPlatform' | translate }}</span>
        <span class="text-slate-300">›</span>
        <span class="font-semibold">{{ 'tenants.pageTitle' | translate }}</span>
      </div>
      <span class="font-display font-semibold text-[14px] sm:hidden">{{ 'tenants.pageTitle' | translate }}</span>
      <a routerLink="/tenants/novo"
         class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors shadow-sm min-h-9">
        {{ 'tenants.new' | translate }}
      </a>
    </div>

    <!-- Page -->
    <div class="p-4 lg:p-7">
      <div class="mb-5">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">{{ 'tenants.pageTitle' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px]">{{ 'tenants.subtitleCount' | translate: { n: total() } }}</p>
      </div>

      @if (error()) {
        <div class="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
          <span>⚠</span><span>{{ error() }}</span>
        </div>
      }

      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-[13.5px]">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 min-w-[220px]">{{ 'tenants.thCompany' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 hidden md:table-cell">{{ 'tenants.thSlug' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3">{{ 'tenants.thStatus' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 hidden lg:table-cell">{{ 'tenants.thTax' | translate }}</th>
                <th class="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-5 py-3 hidden sm:table-cell">{{ 'tenants.thCreated' | translate }}</th>
                <th class="px-5 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              @if (loading()) {
                @for (i of [1,2,3,4,5,6]; track i) {
                  <tr class="border-b border-slate-100">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-slate-100 animate-pulse flex-shrink-0"></div>
                        <div class="h-4 bg-slate-100 rounded animate-pulse flex-1 max-w-[140px]"></div>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell"><div class="h-4 bg-slate-100 rounded animate-pulse w-24"></div></td>
                    <td class="px-5 py-4"><div class="h-5 bg-slate-100 rounded-full animate-pulse w-16"></div></td>
                    <td colspan="3"></td>
                  </tr>
                }
              } @else if (tenants().length === 0) {
                <tr>
                  <td colspan="6" class="px-5 py-16 text-center">
                    <div class="text-3xl mb-3">🏢</div>
                    <p class="text-slate-500 text-sm mb-4">{{ 'tenants.emptyTitle' | translate }}</p>
                    <a routerLink="/tenants/novo"
                       class="inline-flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-[10px] no-underline transition-colors">
                      {{ 'tenants.createFirst' | translate }}
                    </a>
                  </td>
                </tr>
              } @else {
                @for (t of tenants(); track t.id) {
                  <tr class="border-b border-slate-100 hover:bg-slate-50 last:border-0">

                    <!-- Empresa: avatar com cor do branding -->
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center font-semibold text-[13px] flex-shrink-0 border"
                             [style.background]="brandBg(t)"
                             [style.color]="brandColor(t)"
                             [style.border-color]="brandBorderColor(t)">
                          {{ initials(t.nome) }}
                        </div>
                        <div class="min-w-0">
                          <div class="font-semibold truncate">{{ t.nome }}</div>
                          <div class="text-[11.5px] text-slate-400 hidden sm:block truncate">
                            portal.{{ t.slug }}.nossobolao.com.br
                          </div>
                        </div>
                      </div>
                    </td>

                    <!-- Slug -->
                    <td class="px-5 py-4 font-mono text-[12px] text-slate-400 hidden md:table-cell">{{ t.slug }}</td>

                    <!-- Status -->
                    <td class="px-5 py-4">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                            [class]="statusClass(t.status)">
                        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {{ tenantStatusKey(t.status) | translate }}
                      </span>
                    </td>

                    <!-- Taxa -->
                    <td class="px-5 py-4 tabular text-[13px] hidden lg:table-cell">{{ t.taxaAdministrativaPct }}%</td>

                    <!-- Criado em -->
                    <td class="px-5 py-4 text-slate-400 text-[12px] hidden sm:table-cell">{{ fmtDate(t.criadoEm) }}</td>

                    <!-- Actions -->
                    <td class="px-5 py-4">
                      <div class="flex gap-1 justify-end">
                        <button type="button" (click)="abrirEdicao(t)"
                                class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors text-sm"
                                [attr.title]="'common.edit' | translate">✏</button>
                        <button type="button" (click)="toggleStatus(t)"
                                class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-sm"
                                [attr.title]="toggleStatusTitle(t)">
                          {{ t.status === 'ATIVO' ? '⏸' : '▶' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (!loading() && tenants().length > 0 && totalPages() > 1) {
          <div class="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span class="text-xs text-slate-400">{{ 'tenants.pagination' | translate: { shown: tenants().length, total: total() } }}</span>
            <div class="flex gap-1.5">
              <button type="button" (click)="prevPage()" [disabled]="page() <= 1" class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40">{{ 'common.prevPlain' | translate }}</button>
              <button type="button" (click)="nextPage()" [disabled]="page() >= totalPages()" class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40">{{ 'common.nextPlain' | translate }}</button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- ── Modal: Editar Tenant ─────────────────────────────────────────────── -->
    @if (editando()) {
      <div class="fixed inset-0 bg-black/40 z-40" (click)="fecharEdicao()"></div>
      <div class="fixed right-0 top-0 h-full w-full sm:w-[440px] bg-white z-50 flex flex-col shadow-xl overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="font-display font-semibold text-lg">{{ 'tenants.editTitle' | translate }}</h2>
            <p class="text-slate-400 text-xs mt-0.5 font-mono">{{ editando()!.slug }}</p>
          </div>
          <button (click)="fecharEdicao()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-lg">✕</button>
        </div>

        <!-- Conteúdo -->
        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          @if (editError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
              <span>⚠</span><span>{{ editError() }}</span>
            </div>
          }

          <!-- Nome -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelNome' | translate }}</label>
            <input [ngModel]="editNome()" (ngModelChange)="editNome.set($event)" name="editNome"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700" />
          </div>

          <!-- Slug -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelSlug' | translate }}</label>
            <div class="flex items-center border border-slate-200 rounded-[10px] overflow-hidden focus-within:border-green-700 transition-colors">
              <span class="px-2.5 py-2.5 text-[11.5px] text-slate-400 bg-slate-50 border-r border-slate-200 whitespace-nowrap flex-shrink-0">{{ 'tenants.editSlugPrefix' | translate }}</span>
              <input [ngModel]="editSlug()" (ngModelChange)="editSlug.set($event)" name="editSlug"
                     class="flex-1 px-2.5 py-2.5 text-sm font-mono focus:outline-none min-w-0" />
            </div>
          </div>

          <!-- Taxa + Status row -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelTaxa' | translate }}</label>
              <input [ngModel]="editTaxa()" (ngModelChange)="editTaxa.set(+$event)" name="editTaxa"
                     type="number" min="0" max="100" step="0.01"
                     class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm tabular focus:outline-none focus:border-green-700" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelStatus' | translate }}</label>
              <select [ngModel]="editStatus()" (ngModelChange)="editStatus.set($event)" name="editStatus"
                      class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm bg-white focus:outline-none focus:border-green-700">
                <option value="ATIVO">{{ 'tenants.statusATIVO' | translate }}</option>
                <option value="SUSPENSO">{{ 'tenants.statusSUSPENSO' | translate }}</option>
                <option value="INATIVO">{{ 'tenants.statusINATIVO' | translate }}</option>
              </select>
            </div>
          </div>

          <!-- Cor primária -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelCor' | translate }}</label>
            <div class="flex gap-2.5 items-center">
              <!-- Preview com a cor -->
              <div class="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer flex-shrink-0"
                   [style.background]="editCor()"
                   (click)="colorInput.click()"></div>
              <input #colorInput type="color"
                     [ngModel]="editCor()" (ngModelChange)="editCor.set($event)"
                     name="editCorPicker" class="sr-only" />
              <input [ngModel]="editCor()" (ngModelChange)="editCor.set($event)" name="editCorHex"
                     class="flex-1 px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm font-mono focus:outline-none focus:border-green-700"
                     placeholder="#047857" />
              <!-- Avatar preview -->
              <div class="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-[13px] flex-shrink-0 border"
                   [style.background]="brandBgFromColor(editCor())"
                   [style.color]="editCor()"
                   [style.border-color]="brandBgFromColor(editCor())">
                {{ initials(editNome()) }}
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-1">{{ 'tenants.corHint' | translate }}</p>
          </div>

          <!-- Nome customizado -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelNomeCustom' | translate }}</label>
            <input [ngModel]="editNomeCustom()" (ngModelChange)="editNomeCustom.set($event)" name="editNomeCustom"
                   class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                   [attr.placeholder]="'tenants.nomeCustomPh' | translate" />
          </div>

          <!-- Redefinir senha do admin -->
          <div class="border-t border-slate-100 pt-4">
            <button type="button" (click)="mostrarSenha.set(!mostrarSenha())"
                    class="flex items-center gap-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700 transition-colors w-full text-left">
              <span class="text-[10px] transition-transform" [class.rotate-90]="mostrarSenha()">▶</span>
              {{ 'tenants.toggleSenha' | translate }}
            </button>

            @if (mostrarSenha()) {
              <div class="mt-3 flex flex-col gap-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelSenhaNova' | translate }}</label>
                  <input [ngModel]="editAdminSenha()" (ngModelChange)="editAdminSenha.set($event)" name="editAdminSenha"
                         type="password"
                         class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                         [attr.placeholder]="'tenants.senhaPh' | translate" />
                  @if (editSenhaError()) {
                    <p class="text-[11px] text-red-600 mt-1">⚠ {{ editSenhaError() }}</p>
                  }
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-500 mb-1.5 tracking-wide">{{ 'tenants.labelSenhaConfirm' | translate }}</label>
                  <input [ngModel]="editConfirmarSenha()" (ngModelChange)="editConfirmarSenha.set($event)" name="editConfirmarSenha"
                         type="password"
                         class="w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-sm focus:outline-none focus:border-green-700"
                         [attr.placeholder]="'tenants.senhaRepeatPh' | translate" />
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-slate-200 flex gap-2.5 flex-shrink-0">
          <button type="button" (click)="fecharEdicao()" class="flex-1 py-2.5 bg-white border border-slate-200 font-semibold text-sm rounded-[10px] hover:bg-slate-50">{{ 'common.cancel' | translate }}</button>
          <button type="button" (click)="salvarEdicao()" [disabled]="editLoading()"
                  class="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold text-sm rounded-[10px] shadow-sm">
            {{ editLoading() ? ('common.saving' | translate) : ('tenants.saveCheck' | translate) }}
          </button>
        </div>
      </div>
    }
  `,
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
