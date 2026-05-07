import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private _admin!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY');

    this._admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    this.logger.log('Supabase admin client initialized');
  }

  get admin(): SupabaseClient {
    return this._admin;
  }

  // Cria cliente com o token do usuário — respeita RLS do Supabase
  forUser(token: string): SupabaseClient {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');

    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}
