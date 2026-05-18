import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception';

export type WaSessionStatus = 'DESCONECTADO' | 'CARREGANDO' | 'AGUARDANDO_QR' | 'CONECTADO';

export interface WaSessionInfo {
  status: WaSessionStatus;
  qrCode?: string;
  numero?: string;
}

export interface WaGrupoListItem {
  id: string;
  nome: string;
  qtdParticipantes?: number;
}

interface SessionCache {
  status: WaSessionStatus;
  qrCode?: string;
  numero?: string;
}

/**
 * Adapter para Evolution API (substitui whatsapp-web.js).
 * Cada tenant = uma "instance" no Evolution API, identificada pelo tenantId.
 * Estado de sessão é cacheado localmente; webhooks atualizam o cache em tempo real.
 */
@Injectable()
export class WhatsAppClientManager {
  private readonly logger = new Logger(WhatsAppClientManager.name);
  private readonly cache = new Map<string, SessionCache>();

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('EVOLUTION_API_URL', 'http://localhost:8080');
    this.apiKey  = config.get<string>('EVOLUTION_API_KEY', '');
  }

  // ── HTTP helpers ──────────────────────────────────────────────

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Evolution API ${method} ${path} → ${res.status}: ${text}`);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private get<T>(path: string)                 { return this.req<T>('GET',    path); }
  private post<T>(path: string, body: unknown)  { return this.req<T>('POST',   path, body); }
  private del<T>(path: string)                  { return this.req<T>('DELETE', path); }

  // ── Instance management ───────────────────────────────────────

  private async instanceExists(tenantId: string): Promise<boolean> {
    try {
      const list = await this.get<{ instance: { instanceName: string } }[]>(
        `/instance/fetchInstances?instanceName=${tenantId}`,
      );
      return Array.isArray(list) && list.some(i => i.instance?.instanceName === tenantId);
    } catch {
      return false;
    }
  }

  private async createInstance(tenantId: string): Promise<void> {
    await this.post('/instance/create', {
      instanceName: tenantId,
      integration:  'WHATSAPP-BAILEYS',
      qrcode:       true,
    });
    this.logger.log(`Instância Evolution criada para tenant ${tenantId}`);
  }

  private async fetchConnectionState(tenantId: string): Promise<string> {
    try {
      const r = await this.get<{ instance: { state: string } }>(
        `/instance/connectionState/${tenantId}`,
      );
      return r?.instance?.state ?? 'close';
    } catch {
      return 'close';
    }
  }

  // ── Public API (mantém mesma interface do whatsapp-web.js adapter) ──

  async iniciar(tenantId: string): Promise<WaSessionInfo> {
    const cached = this.cache.get(tenantId);
    if (cached?.status === 'CONECTADO')    return { status: 'CONECTADO', numero: cached.numero };
    if (cached?.status === 'AGUARDANDO_QR' && cached.qrCode)
      return { status: 'AGUARDANDO_QR', qrCode: cached.qrCode };
    if (cached?.status === 'CARREGANDO')   return { status: 'CARREGANDO' };

    // Criar instância se não existe
    if (!(await this.instanceExists(tenantId))) {
      await this.createInstance(tenantId);
    }

    const state = await this.fetchConnectionState(tenantId);

    if (state === 'open') {
      const info = await this.fetchInstanceInfo(tenantId);
      const entry: SessionCache = { status: 'CONECTADO', numero: info.numero };
      this.cache.set(tenantId, entry);
      return { status: 'CONECTADO', numero: info.numero };
    }

    // Solicitar conexão (retorna QR ou pairing code)
    try {
      const conn = await this.get<{ base64?: string; code?: string }>(
        `/instance/connect/${tenantId}`,
      );
      const qrCode = conn?.base64;  // "data:image/png;base64,..."
      const entry: SessionCache = { status: qrCode ? 'AGUARDANDO_QR' : 'CARREGANDO', qrCode };
      this.cache.set(tenantId, entry);
      return { status: entry.status, qrCode };
    } catch {
      this.cache.set(tenantId, { status: 'CARREGANDO' });
      return { status: 'CARREGANDO' };
    }
  }

  getStatus(tenantId: string): WaSessionInfo {
    const cached = this.cache.get(tenantId);
    if (!cached) return { status: 'DESCONECTADO' };
    return { status: cached.status, qrCode: cached.qrCode, numero: cached.numero };
  }

  async renovarQr(tenantId: string): Promise<WaSessionInfo> {
    const cached = this.cache.get(tenantId);
    if (cached?.status === 'CONECTADO') {
      throw new BusinessException(
        'WA_RENOVACAO_INVALIDA',
        'WhatsApp já está conectado. Para trocar o aparelho, use encerrar sessão.',
      );
    }
    // Desconectar sem deletar a instância
    try { await this.del(`/instance/logout/${tenantId}`); } catch { /* já desconectado */ }
    this.cache.delete(tenantId);
    return this.iniciar(tenantId);
  }

  async encerrar(tenantId: string): Promise<void> {
    try {
      await this.del(`/instance/logout/${tenantId}`);
    } catch { /* já desconectado */ }
    this.cache.delete(tenantId);
    this.logger.log(`Sessão WhatsApp encerrada para tenant ${tenantId}`);
  }

  async getGrupos(tenantId: string): Promise<WaGrupoListItem[]> {
    const cached = this.cache.get(tenantId);
    if (cached?.status !== 'CONECTADO') {
      throw new BusinessException('WA_DESCONECTADO', 'WhatsApp não está conectado para este tenant');
    }
    const groups = await this.get<{ id: string; subject: string; size?: number }[]>(
      `/group/fetchAllGroups/${tenantId}?getParticipants=false`,
    );
    return (groups ?? []).map(g => ({
      id:    g.id,
      nome:  g.subject,
      ...(g.size != null && { qtdParticipantes: g.size }),
    }));
  }

  async enviarParaGrupo(tenantId: string, grupoId: string, mensagem: string): Promise<void> {
    await this.enviarMensagem(tenantId, grupoId, mensagem);
  }

  async enviarParaNumero(tenantId: string, celular: string, mensagem: string): Promise<void> {
    // Evolution API aceita número puro (normaliza internamente)
    const numero = celular.replace(/\D/g, '');
    await this.enviarMensagem(tenantId, numero, mensagem);
  }

  private async enviarMensagem(tenantId: string, number: string, text: string): Promise<void> {
    const cached = this.cache.get(tenantId);
    if (cached?.status !== 'CONECTADO') {
      throw new BusinessException('WA_DESCONECTADO', 'WhatsApp não está conectado para este tenant');
    }
    await this.post(`/message/sendText/${tenantId}`, { number, text });
  }

  // ── Webhook callbacks (chamados pelo WhatsAppWebhookController) ──

  onConnectionUpdate(tenantId: string, state: string, numero?: string): void {
    if (state === 'open') {
      this.cache.set(tenantId, { status: 'CONECTADO', numero });
      this.logger.log(`WhatsApp conectado para tenant ${tenantId} (${numero ?? '?'})`);
    } else if (state === 'close') {
      this.cache.set(tenantId, { status: 'DESCONECTADO' });
      this.logger.warn(`WhatsApp desconectado para tenant ${tenantId}`);
    } else {
      const cur = this.cache.get(tenantId);
      if (cur?.status !== 'CONECTADO') {
        this.cache.set(tenantId, { status: 'CARREGANDO', qrCode: cur?.qrCode });
      }
    }
  }

  onQrUpdated(tenantId: string, qrBase64: string): void {
    this.cache.set(tenantId, { status: 'AGUARDANDO_QR', qrCode: qrBase64 });
    this.logger.debug(`QR atualizado para tenant ${tenantId}`);
  }

  // ── Helpers ───────────────────────────────────────────────────

  private async fetchInstanceInfo(tenantId: string): Promise<{ numero?: string }> {
    try {
      const list = await this.get<{ instance: { instanceName: string; owner?: string } }[]>(
        `/instance/fetchInstances?instanceName=${tenantId}`,
      );
      const inst = list?.find(i => i.instance?.instanceName === tenantId);
      const raw = inst?.instance?.owner ?? '';
      const numero = raw.replace(/\D/g, '').replace(/:.*$/, '') || undefined;
      return { numero };
    } catch {
      return {};
    }
  }
}
