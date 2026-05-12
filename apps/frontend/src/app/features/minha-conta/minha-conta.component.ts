import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import type { Tenant } from '@nossobolao/shared-types';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { MasterTenantService } from '../../core/services/master-tenant.service';
import { BackButtonComponent } from '../../shared/components/back-button/back-button.component';
import { PhoneMaskDirective } from '../../shared/phone';

const PREFS_KEY = 'nb_admin_prefs_v1';

interface AdminPrefs {
  emailNotif: boolean;
  paymentNotif: boolean;
  weeklySummary: boolean;
  whatsappDisconnectedAlert: boolean;
}

const DEFAULT_PREFS: AdminPrefs = {
  emailNotif: true,
  paymentNotif: true,
  weeklySummary: true,
  whatsappDisconnectedAlert: false,
};

function loadPrefs(): AdminPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<AdminPrefs>;
    return { ...DEFAULT_PREFS, ...p };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefsLocal(p: AdminPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

@Component({
  selector: 'nb-minha-conta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, BackButtonComponent, PhoneMaskDirective],
  template: `
    <!-- Topbar -->
    <div class="bg-white border-b border-slate-200 px-4 lg:px-7 py-3 flex items-center gap-3 sticky top-14 lg:top-0 z-10">
      <nb-back-button />
      <div class="min-w-0 flex-1 flex items-center gap-2">
        <div class="hidden sm:flex items-center gap-2 text-[12.5px] min-w-0">
          <span class="text-slate-400">{{ 'nav.section.system' | translate }}</span>
          <span class="text-slate-300">›</span>
          <span class="font-semibold">{{ 'minhaConta.breadcrumb' | translate }}</span>
        </div>
        <span class="font-display font-semibold text-[14px] sm:hidden truncate">{{ 'minhaConta.pageTitle' | translate }}</span>
      </div>
    </div>

    <div class="p-4 lg:p-7 max-w-3xl mx-auto">
      <div class="mb-6">
        <h1 class="font-display text-2xl lg:text-[26px] font-semibold tracking-tight mb-1">{{ 'minhaConta.pageTitle' | translate }}</h1>
        <p class="text-slate-500 text-[13.5px]">{{ 'minhaConta.subtitle' | translate }}</p>
      </div>

      @if (error()) {
        <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">⚠ {{ error() }}</div>
      }
      @if (saved()) {
        <div class="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 mb-4">{{ 'minhaConta.saved' | translate }}</div>
      }

      <!-- Avatar card -->
      <section class="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-start gap-4">
          <div class="flex items-start gap-4 flex-1 min-w-0">
            <div class="w-16 h-16 rounded-full bg-green-100 text-green-800 flex items-center justify-center font-display font-bold text-xl shrink-0">
              {{ initials() }}
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-[17px] truncate">{{ nomeModel.trim() || displayName() }}</div>
              <div class="text-[13px] text-slate-500 mt-0.5 break-all">
                {{ auth.user()?.email }}
                <span class="text-slate-300"> · </span>
                {{ roleLabelKey() | translate }}
                @if (tenantSubtitle(); as sub) {
                  <span class="text-slate-300"> · </span>{{ sub }}
                }
              </div>
              @if (tenantBadge(); as badge) {
                <span class="inline-flex mt-2 items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide"
                      [class.bg-green-100]="badge.tone === 'ok'"
                      [class.text-green-800]="badge.tone === 'ok'"
                      [class.bg-amber-100]="badge.tone === 'warn'"
                      [class.text-amber-900]="badge.tone === 'warn'"
                      [class.bg-slate-100]="badge.tone === 'muted'"
                      [class.text-slate-600]="badge.tone === 'muted'"
                      [class.bg-red-100]="badge.tone === 'bad'"
                      [class.text-red-800]="badge.tone === 'bad'">
                  {{ badge.labelKey | translate }}
                </span>
              }
            </div>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <button type="button" disabled
                    class="inline-flex items-center px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-400 cursor-not-allowed min-h-10">
              {{ 'minhaConta.changePhoto' | translate }}
            </button>
            <button type="button" disabled
                    class="inline-flex items-center px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-400 cursor-not-allowed min-h-10">
              {{ 'minhaConta.removePhoto' | translate }}
            </button>
          </div>
        </div>
      </section>

      <!-- Dados pessoais -->
      <section class="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <h2 class="text-[15px] font-semibold text-slate-800 mb-4">{{ 'minhaConta.personalData' | translate }}</h2>
        <div class="space-y-4">
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'minhaConta.fullName' | translate }}</span>
            <input type="text" [(ngModel)]="nomeModel" name="nome"
                   class="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-slate-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-green-600/30 focus:border-green-700 min-h-12"
                   [attr.placeholder]="'minhaConta.fullNamePlaceholder' | translate" />
          </label>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'minhaConta.cpf' | translate }}</span>
            <div class="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-400 text-[14px] min-h-12 flex items-center">
              {{ 'common.emDash' | translate }}
            </div>
            <p class="mt-1 text-[12px] text-slate-400">{{ 'minhaConta.cpfHint' | translate }}</p>
          </label>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'auth.email' | translate }}</span>
            <input type="email" [value]="auth.user()?.email ?? ''" disabled
                   class="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-600 text-[14px] cursor-not-allowed min-h-12" />
            <p class="mt-1 text-[12px] text-slate-400">{{ 'minhaConta.emailHint' | translate }}</p>
          </label>
          <label class="block">
            <span class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'minhaConta.phone' | translate }}</span>
            <input type="tel" [(ngModel)]="celularModel" name="celular" phoneMask inputmode="numeric"
                   class="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-slate-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-green-600/30 focus:border-green-700 min-h-12"
                   [attr.placeholder]="'minhaConta.phonePlaceholder' | translate" />
          </label>
          <div>
            <span class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{{ 'minhaConta.tenantRole' | translate }}</span>
            <div class="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-600 text-[14px] min-h-12 flex items-center">
              {{ roleLabelKey() | translate }}
            </div>
            <p class="mt-1 text-[12px] text-slate-400">{{ 'minhaConta.tenantRoleHint' | translate }}</p>
          </div>
        </div>
      </section>

      <!-- Segurança -->
      <section class="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <h2 class="text-[15px] font-semibold text-slate-800 mb-4">{{ 'minhaConta.security' | translate }}</h2>
        <div class="divide-y divide-slate-100">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 first:pt-0">
            <div>
              <div class="font-medium text-[14px]">{{ 'minhaConta.password' | translate }}</div>
              <div class="text-[12.5px] text-slate-500">{{ 'minhaConta.passwordHint' | translate }}</div>
            </div>
            <button type="button" (click)="openPwdModal()"
                    class="inline-flex justify-center items-center px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-12 shrink-0">
              {{ 'minhaConta.changePassword' | translate }}
            </button>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
            <div>
              <div class="font-medium text-[14px]">{{ 'minhaConta.twoFactor' | translate }}</div>
              <div class="text-[12.5px] text-slate-500">{{ 'minhaConta.twoFactorHint' | translate }}</div>
            </div>
            <span class="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase bg-slate-100 text-slate-500 shrink-0">
              {{ 'minhaConta.soon' | translate }}
            </span>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 last:pb-0">
            <div>
              <div class="font-medium text-[14px]">{{ 'minhaConta.sessions' | translate }}</div>
              <div class="text-[12.5px] text-slate-500">{{ 'minhaConta.sessionsHint' | translate }}</div>
            </div>
            <button type="button" disabled
                    class="inline-flex justify-center items-center px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-400 cursor-not-allowed min-h-12 shrink-0">
              {{ 'minhaConta.manageSessions' | translate }}
            </button>
          </div>
        </div>
      </section>

      <!-- Preferências -->
      <section class="bg-white border border-slate-200 rounded-xl p-5 mb-8 shadow-sm">
        <h2 class="text-[15px] font-semibold text-slate-800 mb-4">{{ 'minhaConta.preferences' | translate }}</h2>
        <div class="space-y-4">
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" [(ngModel)]="prefsModel.emailNotif" name="p1"
                   class="mt-1 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600" />
            <span class="text-[14px] text-slate-700">{{ 'minhaConta.prefEmail' | translate }}</span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" [(ngModel)]="prefsModel.paymentNotif" name="p2"
                   class="mt-1 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600" />
            <span class="text-[14px] text-slate-700">{{ 'minhaConta.prefPayments' | translate }}</span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" [(ngModel)]="prefsModel.weeklySummary" name="p3"
                   class="mt-1 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600" />
            <span class="text-[14px] text-slate-700">{{ 'minhaConta.prefWeekly' | translate }}</span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" [(ngModel)]="prefsModel.whatsappDisconnectedAlert" name="p4"
                   class="mt-1 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600" />
            <span class="text-[14px] text-slate-700">{{ 'minhaConta.prefWhatsapp' | translate }}</span>
          </label>
          <p class="text-[12px] text-slate-400">{{ 'minhaConta.prefsLocalHint' | translate }}</p>
        </div>
      </section>

      <!-- Rodapé ações -->
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pb-8">
        <button type="button" (click)="cancelar()" [disabled]="saving()"
                class="inline-flex justify-center items-center px-5 py-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 min-h-12 disabled:opacity-50">
          {{ 'common.cancel' | translate }}
        </button>
        <button type="button" (click)="salvar()" [disabled]="saving()"
                class="inline-flex justify-center items-center px-5 py-3 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-semibold shadow-sm min-h-12 disabled:opacity-50">
          @if (saving()) {
            {{ 'common.saving' | translate }}
          } @else {
            {{ 'minhaConta.saveChanges' | translate }}
          }
        </button>
      </div>
    </div>

    <!-- Modal senha -->
    @if (pwdModalOpen()) {
      <div class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/40"
           (click)="closePwdModalBackdrop($event)">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6" (click)="$event.stopPropagation()">
          <h3 class="font-display font-semibold text-lg mb-1">{{ 'minhaConta.changePassword' | translate }}</h3>
          <p class="text-[13px] text-slate-500 mb-4">{{ 'minhaConta.passwordModalHint' | translate }}</p>
          @if (pwdError(); as pe) {
            <div class="mb-3 p-2.5 rounded-lg bg-red-50 text-red-700 text-sm">
              {{ pwdErrorIsKey(pe) ? (pe | translate) : pe }}
            </div>
          }
          <label class="block mb-3">
            <span class="text-[12px] font-semibold text-slate-500">{{ 'minhaConta.newPassword' | translate }}</span>
            <input [type]="pwdShowModel ? 'text' : 'password'" [(ngModel)]="pwdNew" name="pwdNew" autocomplete="new-password"
                   class="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 min-h-12" />
          </label>
          <label class="block mb-4">
            <span class="text-[12px] font-semibold text-slate-500">{{ 'minhaConta.confirmPassword' | translate }}</span>
            <input [type]="pwdShowModel ? 'text' : 'password'" [(ngModel)]="pwdConfirm" name="pwdConfirm" autocomplete="new-password"
                   class="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 min-h-12" />
          </label>
          <label class="flex items-center gap-2 mb-5 text-[13px] text-slate-600 cursor-pointer">
            <input type="checkbox" [(ngModel)]="pwdShowModel" name="pwdShow" />
            {{ 'auth.showPassword' | translate }}
          </label>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" (click)="closePwdModal()" class="px-4 py-2.5 rounded-lg border border-slate-200 font-semibold text-sm min-h-12">
              {{ 'common.cancel' | translate }}
            </button>
            <button type="button" (click)="submitPassword()" [disabled]="pwdSaving()"
                    class="px-4 py-2.5 rounded-lg bg-green-700 text-white font-semibold text-sm min-h-12 disabled:opacity-50">
              @if (pwdSaving()) {
                {{ 'common.saving' | translate }}
              } @else {
                {{ 'minhaConta.updatePassword' | translate }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MinhaContaComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly masterTenant = inject(MasterTenantService);

  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  readonly saving = signal(false);

  readonly tenantNome = signal<string | null>(null);
  readonly tenantStatus = signal<string | null>(null);

  nomeModel = '';
  celularModel = '';

  prefsModel: AdminPrefs = { ...DEFAULT_PREFS };

  readonly pwdModalOpen = signal(false);
  pwdNew = '';
  pwdConfirm = '';
  pwdShowModel = false;
  readonly pwdError = signal<string | null>(null);
  readonly pwdSaving = signal(false);

  private snapshotNome = '';
  private snapshotCelular = '';
  private snapshotPrefs: AdminPrefs = { ...DEFAULT_PREFS };

  pwdErrorIsKey(msg: string): boolean {
    return msg.startsWith('minhaConta.');
  }

  readonly roleLabelKey = computed(() =>
    this.auth.isMaster() ? 'minhaConta.roleMaster' : 'minhaConta.roleAdmin',
  );

  readonly displayName = computed(() => {
    const u = this.auth.user();
    const n = u?.nomeCompleto?.trim();
    if (n) return n;
    const email = u?.email ?? '';
    const local = email.split('@')[0];
    return local || email;
  });

  readonly tenantSubtitle = computed(() => {
    if (this.auth.isMaster()) {
      const t = this.masterTenant.tenant();
      if (t) return t.nome;
      return null;
    }
    return this.tenantNome();
  });

  readonly tenantBadge = computed((): { labelKey: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } | null => {
    let status: string | null = null;
    if (this.auth.isMaster()) {
      status = this.masterTenant.tenant()?.status ?? null;
    } else {
      status = this.tenantStatus();
    }
    if (!status) return null;
    const up = status.toUpperCase();
    if (up === 'ATIVO') return { labelKey: 'minhaConta.statusActive', tone: 'ok' };
    if (up === 'SUSPENSO') return { labelKey: 'minhaConta.statusSuspended', tone: 'bad' };
    if (up === 'INATIVO') return { labelKey: 'minhaConta.statusInactive', tone: 'muted' };
    return { labelKey: 'minhaConta.statusUnknown', tone: 'warn' };
  });

  initials(): string {
    const u = this.auth.user();
    const base = this.nomeModel.trim() || u?.nomeCompleto?.trim() || u?.email || '?';
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return base.slice(0, 2).toUpperCase();
  }

  async ngOnInit(): Promise<void> {
    const u = this.auth.user();
    if (!u) return;

    this.nomeModel = u.nomeCompleto ?? '';
    this.celularModel = u.celular ?? '';
    this.prefsModel = loadPrefs();

    if (!this.auth.isMaster()) {
      try {
        const t = await firstValueFrom(this.api.get<Tenant>('/tenants/me'));
        this.tenantNome.set(t.nome);
        this.tenantStatus.set(t.status);
      } catch {
        this.error.set(null);
        this.tenantNome.set(null);
        this.tenantStatus.set(null);
      }
    }

    this.captureSnapshot();
  }

  private captureSnapshot(): void {
    this.snapshotNome = this.nomeModel;
    this.snapshotCelular = this.celularModel;
    this.snapshotPrefs = { ...this.prefsModel };
  }

  cancelar(): void {
    this.nomeModel = this.snapshotNome;
    this.celularModel = this.snapshotCelular;
    this.prefsModel = { ...this.snapshotPrefs };
    this.saved.set(false);
    this.error.set(null);
  }

  async salvar(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      await this.auth.updateUserMetadata({
        nome_completo: this.nomeModel.trim() || null,
        celular: this.normalizeCelular(this.celularModel),
      });
      savePrefsLocal({ ...this.prefsModel });
      this.captureSnapshot();
      this.saved.set(true);
      globalThis.setTimeout(() => this.saved.set(false), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  private normalizeCelular(raw: string): string | null {
    const d = raw.replace(/\D/g, '');
    return d.length ? raw.trim() : null;
  }

  openPwdModal(): void {
    this.pwdNew = '';
    this.pwdConfirm = '';
    this.pwdError.set(null);
    this.pwdModalOpen.set(true);
  }

  closePwdModal(): void {
    this.pwdModalOpen.set(false);
    this.pwdError.set(null);
  }

  closePwdModalBackdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.closePwdModal();
  }

  async submitPassword(): Promise<void> {
    this.pwdError.set(null);
    if (this.pwdNew.length < 6) {
      this.pwdError.set('minhaConta.passwordTooShort');
      return;
    }
    if (this.pwdNew !== this.pwdConfirm) {
      this.pwdError.set('minhaConta.passwordMismatch');
      return;
    }
    this.pwdSaving.set(true);
    try {
      await this.auth.updatePassword(this.pwdNew);
      this.closePwdModal();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.pwdError.set(msg);
    } finally {
      this.pwdSaving.set(false);
    }
  }
}
