import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from './modules/auth/decorators/public.decorator';
import { PrismaService } from './modules/prisma/prisma.service';

type ComponentStatus = 'ok' | 'down' | 'degraded';

interface ComponentCheck {
  status: ComponentStatus;
  latencyMs?: number;
  error?: string;
}

interface HealthDetail {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  version: string;
  components: {
    database:  ComponentCheck;
    redis:     ComponentCheck;
    supabase:  ComponentCheck;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  check(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('detail')
  async detail(): Promise<HealthDetail> {
    const [database, redis, supabase] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkSupabase(),
    ]);

    const anyDown      = [database, redis, supabase].some(c => c.status === 'down');
    const anyDegraded  = [database, redis, supabase].some(c => c.status === 'degraded');
    const overall      = anyDown ? 'down' : anyDegraded ? 'degraded' : 'ok';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: process.env['npm_package_version'] ?? '0.0.1',
      components: { database, redis, supabase },
    };
  }

  private async checkDatabase(): Promise<ComponentCheck> {
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - t0;
      return { status: latencyMs > 2000 ? 'degraded' : 'ok', latencyMs };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - t0, error: String(err).slice(0, 120) };
    }
  }

  private async checkRedis(): Promise<ComponentCheck> {
    const url = this.config.get<string>('REDIS_URL', '');
    if (!url) return { status: 'degraded', error: 'REDIS_URL não configurado' };

    const t0 = Date.now();
    let client: import('ioredis').default | null = null;
    try {
      const { default: Redis } = await import('ioredis');
      client = new Redis(url, { connectTimeout: 4000, lazyConnect: true, enableOfflineQueue: false });
      await client.connect();
      await client.ping();
      const latencyMs = Date.now() - t0;
      return { status: latencyMs > 1000 ? 'degraded' : 'ok', latencyMs };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - t0, error: String(err).slice(0, 120) };
    } finally {
      client?.disconnect();
    }
  }

  private async checkSupabase(): Promise<ComponentCheck> {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL', '');
    if (!supabaseUrl) return { status: 'degraded', error: 'SUPABASE_URL não configurado' };

    const t0 = Date.now();
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: this.config.get<string>('SUPABASE_SERVICE_KEY', '') },
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - t0;
      if (!res.ok && res.status !== 200 && res.status !== 404) {
        return { status: 'degraded', latencyMs, error: `HTTP ${res.status}` };
      }
      return { status: latencyMs > 3000 ? 'degraded' : 'ok', latencyMs };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - t0, error: String(err).slice(0, 120) };
    }
  }
}
