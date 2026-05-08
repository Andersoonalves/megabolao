import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export type UserRole = 'MASTER' | 'ADMIN' | 'PARTICIPANTE';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  celular: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase: SupabaseClient;

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _loading = signal(true);

  readonly user = this._user.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly isMaster = computed(() => this._user()?.role === 'MASTER');
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');
  readonly tenantId = computed(() => this._user()?.tenantId ?? null);

  constructor(private readonly router: Router) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    this.initAuth();
  }

  private initAuth(): void {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._user.set(session?.user ? this.mapUser(session.user) : null);
      this._loading.set(false);
    });
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this.router.navigate(['/dashboard']);
  }

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
    await this.router.navigate(['/portal']);
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    await this.router.navigate(['/login']);
  }

  getAccessToken(): string | null {
    // Synchronous token retrieval for HTTP interceptor
    return (this.supabase as unknown as { auth: { session: () => { access_token: string } | null } })
      .auth.session()?.access_token ?? null;
  }

  private mapUser(user: User): AuthUser {
    const meta = user.user_metadata as { papel?: string; tenant_id?: string; celular?: string };
    const role: UserRole = meta.papel === 'MASTER' ? 'MASTER'
      : meta.papel === 'ADMIN' ? 'ADMIN'
      : 'PARTICIPANTE';

    return {
      id: user.id,
      email: user.email ?? '',
      role,
      tenantId: role === 'MASTER' ? null : (meta.tenant_id ?? null),
      celular: meta.celular ?? null,
    };
  }
}
