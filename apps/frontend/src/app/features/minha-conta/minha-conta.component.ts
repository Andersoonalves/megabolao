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
  templateUrl: './minha-conta.component.html',
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

  // ── 2FA ────────────────────────────────────────────────────────────────────
  readonly mfaEnrolled = computed(() => this.auth.user()?.mfaEnrolled ?? false);
  readonly mfaLoading  = signal(false);
  readonly mfaError    = signal('');
  readonly mfaStep     = signal<'idle' | 'qr' | 'disable'>('idle');
  readonly mfaQrCode   = signal('');
  readonly mfaSecret   = signal('');
  readonly mfaCode     = signal('');
  private mfaFactorId  = '';

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

  // ── Métodos 2FA ────────────────────────────────────────────────────────────

  async iniciarAtivar2FA(): Promise<void> {
    this.mfaLoading.set(true);
    this.mfaError.set('');
    try {
      // Admin API garante limpeza de fatores pendentes (SDK não lista não verificados)
      await firstValueFrom(this.api.delete('/auth/mfa/self')).catch(() => undefined);
      const result = await this.auth.enrollTotp();
      this.mfaFactorId = result.factorId;
      this.mfaQrCode.set(result.qrCode);
      this.mfaSecret.set(result.secret);
      this.mfaCode.set('');
      this.mfaStep.set('qr');
    } catch (e: unknown) {
      this.mfaError.set(e instanceof Error ? e.message : 'Erro ao gerar QR Code');
    } finally {
      this.mfaLoading.set(false);
    }
  }

  async confirmarEnroll(): Promise<void> {
    if (this.mfaCode().length !== 6 || this.mfaLoading()) return;
    this.mfaLoading.set(true);
    this.mfaError.set('');
    try {
      await this.auth.verifyTotpEnrollment(this.mfaFactorId, this.mfaCode());
      // Sincroniza flag no backend
      await firstValueFrom(this.api.post('/auth/mfa/sync', { enrolled: true }));
      await this.auth.refreshSession();
      this.mfaStep.set('idle');
    } catch {
      this.mfaError.set('Código inválido. Verifique seu app autenticador.');
      this.mfaCode.set('');
    } finally {
      this.mfaLoading.set(false);
    }
  }

  iniciarDesativar2FA(): void {
    this.mfaCode.set('');
    this.mfaError.set('');
    this.mfaStep.set('disable');
  }

  async confirmarDesativar(): Promise<void> {
    if (this.mfaCode().length !== 6 || this.mfaLoading()) return;
    this.mfaLoading.set(true);
    this.mfaError.set('');
    try {
      const fatores = await this.auth.listTotpFactors();
      if (fatores.length === 0) throw new Error('Nenhum fator encontrado');
      await this.auth.unenrollTotp(fatores[0].id, this.mfaCode());
      // Sincroniza flag no backend
      await firstValueFrom(this.api.post('/auth/mfa/sync', { enrolled: false }));
      await this.auth.refreshSession();
      this.mfaStep.set('idle');
    } catch {
      this.mfaError.set('Código inválido ou erro ao desativar. Tente novamente.');
      this.mfaCode.set('');
    } finally {
      this.mfaLoading.set(false);
    }
  }

  cancelarMfa(): void {
    this.mfaStep.set('idle');
    this.mfaCode.set('');
    this.mfaError.set('');
    this.mfaQrCode.set('');
    this.mfaSecret.set('');
  }

  // ── Senha ──────────────────────────────────────────────────────────────────

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
