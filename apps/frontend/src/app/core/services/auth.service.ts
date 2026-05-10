import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { CodigoPermissao, WILDCARD_PERMISSAO } from '@nossobolao/shared-types';
import { environment } from '../../../environments/environment';

export type UserRole = 'MASTER' | 'ADMIN' | 'PARTICIPANTE';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  celular: string | null;
  permissoes: CodigoPermissao[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase: SupabaseClient;

  private readonly _user    = signal<AuthUser | null>(null);
  private readonly _loading = signal(true);
  // Token armazenado sincronamente — usado pelo authInterceptor
  private _currentToken: string | null = null;

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
    this.supabase.auth.getSession().then(({ data }) => {
      this.applySession(data.session);
      this._loading.set(false);
    });

    // 2. Reagir a mudanças de sessão (login, logout, token refresh)
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.applySession(session);
      this._loading.set(false);
    });
  }

  private applySession(session: Session | null): void {
    this._currentToken = session?.access_token ?? null;
    this._user.set(session?.user ? this.mapUser(session.user) : null);
  }

  // ── Sincrono — seguro para uso no HttpInterceptorFn ──────────────────────
  getAccessToken(): string | null {
    return this._currentToken;
  }

  // ── Autenticação email/senha (Admin / Master) ─────────────────────────────
  async signInWithEmail(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // MASTER não tem tenant — não pode cair no dashboard admin (/boloes exige X-Tenant-Id).
    const meta = data.user?.user_metadata as { papel?: string } | undefined;
    const dest = meta?.papel === 'MASTER' ? '/dashboard-master' : '/dashboard';
    await this.router.navigate([dest]);
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
    await this.supabase.auth.signOut();
    await this.router.navigate(['/login']);
  }

  private mapUser(user: User): AuthUser {
    const meta = user.user_metadata as {
      papel?: string;
      tenant_id?: string;
      celular?: string;
      permissoes?: CodigoPermissao[];
    };
    const role: UserRole = meta.papel === 'MASTER' ? 'MASTER'
      : meta.papel === 'ADMIN'  ? 'ADMIN'
      : 'PARTICIPANTE';

    const permissoes: CodigoPermissao[] = role === 'MASTER'
      ? [WILDCARD_PERMISSAO]
      : Array.isArray(meta.permissoes) ? meta.permissoes : [];

    return {
      id:       user.id,
      email:    user.email ?? '',
      role,
      tenantId: role === 'MASTER' ? null : (meta.tenant_id ?? null),
      celular:  meta.celular ?? null,
      permissoes,
    };
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
}
