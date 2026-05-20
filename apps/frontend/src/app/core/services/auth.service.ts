import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { AuthChangeEvent, createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { CodigoPermissao, WILDCARD_PERMISSAO } from '@nossobolao/shared-types';
import { environment } from '../../../environments/environment';

export type UserRole = 'MASTER' | 'ADMIN' | 'PARTICIPANTE';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  celular: string | null;
  /** `user_metadata.nome_completo` — opcional. */
  nomeCompleto: string | null;
  permissoes: CodigoPermissao[];
  mfaEnrolled: boolean;
}

export interface MfaEnrollResult {
  factorId: string;
  qrCode: string;  // SVG data URI
  secret: string;  // para entrada manual no app
}

export interface MfaAssuranceLevel {
  currentLevel: 'aal1' | 'aal2';
  nextLevel: 'aal1' | 'aal2';
  needsVerification: boolean;
}

/** sessionStorage — aviso na próxima tela de login após expiração. */
export const SESSION_EXPIRED_STORAGE_KEY = 'nb_session_expired';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase: SupabaseClient;

  private readonly _user    = signal<AuthUser | null>(null);
  private readonly _loading = signal(true);
  // Token armazenado sincronamente — usado pelo authInterceptor
  private _currentToken: string | null = null;
  private _sessionExpiryInProgress = false;
  private _manualSignOut = false;
  /** Evita tratar SIGNED_OUT inicial (visitante sem login) como expiração. */
  private _hadAuthenticatedSession = false;

  readonly user            = this._user.asReadonly();
  readonly loading         = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isMaster        = computed(() => this._user()?.role === 'MASTER');
  readonly isAdmin         = computed(() => this._user()?.role === 'ADMIN');
  readonly tenantId        = computed(() => this._user()?.tenantId ?? null);
  /** Permissões granulares efetivas. MASTER recebe `['*']`. */
  readonly permissoes      = computed<CodigoPermissao[]>(() => this._user()?.permissoes ?? []);

  constructor(private readonly router: Router) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    this.initAuth();
  }

  private initAuth(): void {
    // 1. Restaurar sessão do localStorage (necessário no page refresh)
    this.supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        const hadStoredSession = this.hasPersistedSupabaseSession();
        this.clearLocalSession();
        if ((this._hadAuthenticatedSession || hadStoredSession) && !this._manualSignOut) {
          void this.handleSessionExpired();
        }
      } else {
        this.applySession(data.session);
      }
      this._loading.set(false);
    });

    // 2. Reagir a mudanças de sessão (login, logout, token refresh)
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.onAuthEvent(event, session);
      this._loading.set(false);
    });
  }

  private onAuthEvent(event: AuthChangeEvent, session: Session | null): void {
    if (event === 'SIGNED_OUT') {
      const wasLoggedIn = this._hadAuthenticatedSession;
      this.clearLocalSession();
      this._hadAuthenticatedSession = false;
      if (wasLoggedIn && !this._manualSignOut && !this._sessionExpiryInProgress) {
        void this.handleSessionExpired();
      }
      return;
    }

    if (event === 'TOKEN_REFRESHED' && !session) {
      void this.handleSessionExpired();
      return;
    }

    this.applySession(session);
  }

  private clearLocalSession(): void {
    this._currentToken = null;
    this._user.set(null);
  }

  /**
   * Sessão inválida ou expirada: limpa estado local, redireciona ao login e
   * marca aviso para exibir na próxima tela de autenticação.
   * Usa `signOut({ scope: 'local' })` para não chamar refresh no GoTrue (evita 403/oauth).
   */
  async handleSessionExpired(): Promise<void> {
    if (this._sessionExpiryInProgress) return;
    if (this.isAuthRoute()) return;

    this._sessionExpiryInProgress = true;
    sessionStorage.setItem(SESSION_EXPIRED_STORAGE_KEY, '1');
    this.clearLocalSession();

    try {
      await this.supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* token já inválido — limpeza local basta */
    }

    const dest = this.router.url.startsWith('/portal') ? '/portal/login' : '/login';
    await this.router.navigateByUrl(dest, { replaceUrl: true });
    this._sessionExpiryInProgress = false;
  }

  /** Lê e remove o flag de sessão expirada (telas de login). */
  consumeSessionExpiredNotice(): boolean {
    const flag = sessionStorage.getItem(SESSION_EXPIRED_STORAGE_KEY);
    if (!flag) return false;
    sessionStorage.removeItem(SESSION_EXPIRED_STORAGE_KEY);
    return true;
  }

  private isAuthRoute(): boolean {
    const url = this.router.url;
    return url.startsWith('/login') || url.startsWith('/portal/login');
  }

  private hasPersistedSupabaseSession(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return Object.keys(localStorage).some((k) => k.includes('-auth-token'));
  }

  private applySession(session: Session | null): void {
    this._currentToken = session?.access_token ?? null;
    if (session?.user) {
      this._hadAuthenticatedSession = true;
      this._user.set(this.mapUser(session.user));
    } else {
      this._user.set(null);
    }
  }

  // ── Sincrono — seguro para uso no HttpInterceptorFn ──────────────────────
  getAccessToken(): string | null {
    return this._currentToken;
  }

  // ── Autenticação email/senha (Admin / Master) ─────────────────────────────

  /**
   * Realiza login e verifica se 2FA é necessário.
   * Retorna `{ needsMfa: true }` se sessão precisa de verificação TOTP antes de navegar.
   * Retorna `{ needsMfa: false }` e navega automaticamente se 2FA não é necessário.
   */
  async signInWithEmail(email: string, password: string): Promise<{ needsMfa: boolean }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const meta = data.user?.user_metadata as { papel?: string; permissoes?: string[] } | undefined;
    this._postLoginDest = meta?.papel === 'MASTER' ? '/dashboard-master' : '/dashboard';

    const aal = await this.getMfaAssuranceLevel();
    if (aal.needsVerification) return { needsMfa: true };

    // ADMIN: refresh session to pick up backend-synced permissions
    // The backend lazy-syncs permissions on first API call, but the JWT
    // returned by signInWithPassword may have stale/empty permissions.
    if (meta?.papel === 'ADMIN' && (!Array.isArray(meta.permissoes) || meta.permissoes.length === 0)) {
      await this.refreshSession();
    }

    await this.router.navigate([this._postLoginDest]);
    return { needsMfa: false };
  }

  private _postLoginDest = '/dashboard';

  /** Navega para o destino pós-login (chamado após verificação TOTP bem-sucedida). */
  async navigateAfterLogin(): Promise<void> {
    await this.router.navigate([this._postLoginDest]);
  }

  // ── OTP (Portal participante) ─────────────────────────────────────────────
  async signInWithOtp(celular: string): Promise<void> {
    const phone = celular.replace(/\D/g, '');
    const { error } = await this.supabase.auth.signInWithOtp({ phone: `+55${phone}` });
    if (error) throw error;
  }

  async verifyOtp(celular: string, token: string): Promise<void> {
    const phone = celular.replace(/\D/g, '');
    const { error } = await this.supabase.auth.verifyOtp({
      phone: `+55${phone}`,
      token,
      type: 'sms',
    });
    if (error) throw error;
    await this.router.navigate(['/portal/cotas']);
  }

  async signOut(): Promise<void> {
    this._manualSignOut = true;
    try {
      await this.supabase.auth.signOut({ scope: 'local' });
    } finally {
      this.clearLocalSession();
      this._manualSignOut = false;
    }
    sessionStorage.removeItem(SESSION_EXPIRED_STORAGE_KEY);
    await this.router.navigate(['/login']);
  }

  private mapUser(user: User): AuthUser {
    const meta = user.user_metadata as {
      papel?: string;
      tenant_id?: string;
      celular?: string;
      nome_completo?: string;
      permissoes?: CodigoPermissao[];
    };
    const role: UserRole = meta.papel === 'MASTER' ? 'MASTER'
      : meta.papel === 'ADMIN'  ? 'ADMIN'
      : 'PARTICIPANTE';

    const permissoes: CodigoPermissao[] = role === 'MASTER'
      ? [WILDCARD_PERMISSAO]
      : Array.isArray(meta.permissoes) ? meta.permissoes : [];

    return {
      id:             user.id,
      email:          user.email ?? '',
      role,
      tenantId:       role === 'MASTER' ? null : (meta.tenant_id ?? null),
      celular:        meta.celular ?? user.phone ?? null,
      nomeCompleto:   typeof meta.nome_completo === 'string' && meta.nome_completo.trim()
        ? meta.nome_completo.trim()
        : null,
      permissoes,
      mfaEnrolled:    (meta as { mfa_enrolled?: boolean }).mfa_enrolled === true,
    };
  }

  /** Atualiza senha (Supabase Auth). */
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  /**
   * Mescla chaves em `user_metadata` e atualiza o JWT.
   * Usado para nome completo e celular exibidos no painel.
   */
  async updateUserMetadata(partial: Record<string, string | null>): Promise<void> {
    const { data: { user }, error: gu } = await this.supabase.auth.getUser();
    if (gu) throw gu;
    const base = { ...(user?.user_metadata ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(partial)) {
      if (v === null || v === '') {
        delete base[k];
      } else {
        base[k] = v;
      }
    }
    const { error } = await this.supabase.auth.updateUser({
      data: base as User['user_metadata'],
    });
    if (error) throw error;
    await this.refreshSession();
  }

  // ── RBAC: helpers reativos ────────────────────────────────────────────────
  /** Verifica se o usuário possui a permissão (ou se é MASTER com curinga). */
  temPermissao(codigo: CodigoPermissao): boolean {
    const permissoes = this._user()?.permissoes ?? [];
    return permissoes.includes(WILDCARD_PERMISSAO) || permissoes.includes(codigo);
  }

  /** Verifica se possui pelo menos uma das permissões informadas. */
  temAlgumaPermissao(codigos: readonly CodigoPermissao[]): boolean {
    if (codigos.length === 0) return true;
    const permissoes = this._user()?.permissoes ?? [];
    if (permissoes.includes(WILDCARD_PERMISSAO)) return true;
    return codigos.some((c) => permissoes.includes(c));
  }

  /** Verifica se possui TODAS as permissões informadas. */
  temTodasPermissoes(codigos: readonly CodigoPermissao[]): boolean {
    if (codigos.length === 0) return true;
    const permissoes = this._user()?.permissoes ?? [];
    if (permissoes.includes(WILDCARD_PERMISSAO)) return true;
    return codigos.every((c) => permissoes.includes(c));
  }

  /**
   * Força atualização do JWT — usado quando o backend ressincroniza permissões
   * (`user_metadata.permissoes`). Dispara `onAuthStateChange` automaticamente.
   */
  async refreshSession(): Promise<void> {
    const { error } = await this.supabase.auth.refreshSession();
    if (error) throw error;
  }

  // ── 2FA / MFA (TOTP) ─────────────────────────────────────────────────────

  /** Verifica se a sessão atual precisa de verificação TOTP. */
  async getMfaAssuranceLevel(): Promise<MfaAssuranceLevel> {
    const { data, error } = await this.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return {
      currentLevel: data.currentLevel as 'aal1' | 'aal2',
      nextLevel: data.nextLevel as 'aal1' | 'aal2',
      needsVerification: data.currentLevel !== data.nextLevel,
    };
  }

  /** Inicia enrollment de TOTP — retorna QR code e secret para o usuário escanear. */
  async enrollTotp(): Promise<MfaEnrollResult> {
    const { data, error } = await this.supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'NossoBolão' });
    if (error) throw error;
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }

  /** Verifica o código TOTP e conclui o enrollment. */
  async verifyTotpEnrollment(factorId: string, code: string): Promise<void> {
    const { data: challenge, error: ce } = await this.supabase.auth.mfa.challenge({ factorId });
    if (ce) throw ce;
    const { error: ve } = await this.supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (ve) throw ve;
  }

  /** Remove o fator TOTP (auto-desativar pelo próprio usuário). Requer código atual para confirmar. */
  async unenrollTotp(factorId: string, code: string): Promise<void> {
    // Verifica o código antes de desabilitar para confirmar que o usuário tem acesso ao app
    const { data: challenge, error: ce } = await this.supabase.auth.mfa.challenge({ factorId });
    if (ce) throw ce;
    const { error: ve } = await this.supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (ve) throw ve;

    const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
  }

  /** Verifica código TOTP para elevar sessão de aal1 → aal2 (fluxo pós-login). */
  async verifyTotpChallenge(code: string): Promise<void> {
    const { data: factors } = await this.supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) throw new Error('Nenhum fator TOTP encontrado');

    const { data: challenge, error: ce } = await this.supabase.auth.mfa.challenge({ factorId: totp.id });
    if (ce) throw ce;
    const { error } = await this.supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code });
    if (error) throw error;

    // Sessão agora é aal2 — recarrega para o backend aceitar
    await this.refreshSession();
  }

  /** Lista fatores TOTP ativos. */
  async listTotpFactors(): Promise<{ id: string; status: string }[]> {
    const { data } = await this.supabase.auth.mfa.listFactors();
    return data?.totp ?? [];
  }
}
