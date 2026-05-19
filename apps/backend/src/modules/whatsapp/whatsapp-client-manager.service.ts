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

/** Linha normalizada de GET /instance/fetchInstances (Evolution API v2). */
interface EvolutionInstanceSummary {
  instanceName: string;
  status?: string;
  ownerJid?: string;
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
  /** Evita POST /webhook/set a cada poll (reinicia a sessão Baileys). */
  private readonly webhookConfigured = new Set<string>();
  private readonly lastConnectAt = new Map<string, number>();
  private static readonly CONNECT_COOLDOWN_MS = 12_000;

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

  /** Evolution v2: array de `{ instance: { instanceName, status, owner } }` ou variantes flat. */
  private normalizeInstances(raw: unknown): EvolutionInstanceSummary[] {
    if (!Array.isArray(raw)) return [];
    const out: EvolutionInstanceSummary[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const nested = row['instance'] as Record<string, unknown> | undefined;
      const src = nested ?? row;
      const instanceName =
        (typeof src['instanceName'] === 'string' && src['instanceName']) ||
        (typeof src['name'] === 'string' && src['name']) ||
        (typeof row['instanceName'] === 'string' && row['instanceName']) ||
        '';
      if (!instanceName) continue;
      const status =
        (typeof src['status'] === 'string' && src['status']) ||
        (typeof src['state'] === 'string' && src['state']) ||
        (typeof row['connectionStatus'] === 'string' && row['connectionStatus']) ||
        undefined;
      const ownerRaw =
        (typeof src['owner'] === 'string' && src['owner']) ||
        (typeof src['ownerJid'] === 'string' && src['ownerJid']) ||
        undefined;
      out.push({ instanceName, status, ownerJid: ownerRaw });
    }
    return out;
  }

  private async fetchInstances(instanceName?: string): Promise<EvolutionInstanceSummary[]> {
    const q = instanceName
      ? `?instanceName=${encodeURIComponent(instanceName)}`
      : '';
    const raw = await this.get<unknown>(`/instance/fetchInstances${q}`);
    return this.normalizeInstances(raw);
  }

  /** fetchInstances costuma retornar [] nesta imagem Docker; connectionState é mais confiável. */
  private async instanceExists(tenantId: string): Promise<boolean> {
    try {
      await this.get(`/instance/connectionState/${tenantId}`);
      return true;
    } catch {
      return false;
    }
  }

  private isInstanceNameInUseError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('already in use') || msg.includes('"403"') || msg.includes('→ 403:');
  }

  private isNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('→ 404:') ||
      msg.includes('"404"') ||
      msg.includes('does not exist') ||
      msg.includes('not found')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async ensureWebhookOnce(tenantId: string): Promise<void> {
    if (this.webhookConfigured.has(tenantId)) return;
    try {
      await this.setWebhook(tenantId);
      this.webhookConfigured.add(tenantId);
    } catch (err) {
      this.logger.warn(`setWebhook: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async deleteInstance(tenantId: string): Promise<void> {
    try {
      await this.del(`/instance/delete/${tenantId}`);
      this.logger.log(`Instância Evolution removida: ${tenantId.slice(0, 8)}…`);
    } catch {
      /* já removida */
    }
    this.webhookConfigured.delete(tenantId);
    this.lastConnectAt.delete(tenantId);
  }

  /** Cria instância ou reutiliza se o nome já existir na Evolution API. */
  private async ensureInstance(tenantId: string): Promise<void> {
    if (await this.instanceExists(tenantId)) {
      await this.ensureWebhookOnce(tenantId);
      return;
    }
    try {
      await this.createInstance(tenantId);
      this.webhookConfigured.add(tenantId);
    } catch (err) {
      if (!this.isInstanceNameInUseError(err)) throw err;
      this.logger.warn(
        `Instância ${tenantId.slice(0, 8)}… já existe na Evolution API; reutilizando`,
      );
      await this.ensureWebhookOnce(tenantId);
    }
  }

  private webhookUrl(): string {
    const base = this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
    return `${base}/api/v1/whatsapp/webhook`;
  }

  private webhookPayload() {
    return {
      enabled:         true,
      url:             this.webhookUrl(),
      webhookByEvents: false,
      webhookBase64:   true,
      events:          ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'] as const,
    };
  }

  private async createInstance(tenantId: string): Promise<void> {
    const created = await this.post<{ qrcode?: Record<string, unknown> }>('/instance/create', {
      instanceName: tenantId,
      integration:  'WHATSAPP-BAILEYS',
      qrcode:       true,
      webhook:      this.webhookPayload(),
    });
    const qr = this.extractQrFromConnectResponse(created?.qrcode ?? created);
    if (qr) {
      this.cache.set(tenantId, { status: 'AGUARDANDO_QR', qrCode: qr });
    }
    this.logger.log(`Instância Evolution criada para tenant ${tenantId}`);
  }

  async setWebhook(tenantId: string): Promise<void> {
    await this.post(`/webhook/set/${tenantId}`, { webhook: this.webhookPayload() });
    this.logger.log(`Webhook configurado para tenant ${tenantId}: ${this.webhookUrl()}`);
  }

  private async fetchConnectionState(tenantId: string): Promise<string> {
    try {
      // Evolution API v2: { instance: { instanceName, state } }
      const r = await this.get<{ instance?: { state?: string }; state?: string }>(
        `/instance/connectionState/${tenantId}`,
      );
      return r?.instance?.state ?? r?.state ?? 'close';
    } catch (err) {
      if (this.isNotFoundError(err)) return 'absent';
      return 'close';
    }
  }

  /** Recria instância na Evolution após delete (evita setWebhook em registro fantasma). */
  private async recreateInstance(tenantId: string): Promise<void> {
    try {
      await this.createInstance(tenantId);
      this.webhookConfigured.add(tenantId);
    } catch (err) {
      if (!this.isInstanceNameInUseError(err)) throw err;
      this.logger.warn(`Instância ${tenantId.slice(0, 8)}… ainda registrada; forçando delete e recriação`);
      await this.deleteInstance(tenantId);
      await this.delay(500);
      await this.createInstance(tenantId);
      this.webhookConfigured.add(tenantId);
    }
  }

  // ── Public API (mantém mesma interface do whatsapp-web.js adapter) ──

  async iniciar(tenantId: string): Promise<WaSessionInfo> {
    this.logger.log(`[INICIAR] tenant=${tenantId.slice(0,8)}... cache=${this.cache.get(tenantId)?.status ?? 'vazio'}`);
    const cached = this.cache.get(tenantId);
    if (cached?.status === 'CONECTADO') {
      return { status: 'CONECTADO', numero: cached.numero };
    }
    if (cached?.status === 'AGUARDANDO_QR' && cached.qrCode) {
      return { status: 'AGUARDANDO_QR', qrCode: cached.qrCode };
    }
    return this.syncConnection(tenantId, true);
  }

  /** Polling do frontend — reconsulta Evolution e atualiza cache (QR via webhook ou /connect). */
  async refreshStatus(tenantId: string): Promise<WaSessionInfo> {
    return this.syncConnection(tenantId, false);
  }

  getStatus(tenantId: string): WaSessionInfo {
    const cached = this.cache.get(tenantId);
    if (!cached) return { status: 'DESCONECTADO' };
    return { status: cached.status, qrCode: cached.qrCode, numero: cached.numero };
  }

  private async syncConnection(tenantId: string, ensure: boolean): Promise<WaSessionInfo> {
    if (ensure) {
      await this.ensureInstance(tenantId);
    }

    const cachedBefore = this.cache.get(tenantId);
    if (cachedBefore?.status === 'AGUARDANDO_QR' && cachedBefore.qrCode) {
      return { status: 'AGUARDANDO_QR', qrCode: cachedBefore.qrCode };
    }

    const state = await this.fetchConnectionState(tenantId);
    this.logger.debug(`[SYNC] tenant=${tenantId.slice(0, 8)}… state=${state}`);

    if (state === 'absent') {
      if (ensure) {
        await this.recreateInstance(tenantId);
      }
      const afterCreate = this.cache.get(tenantId);
      if (afterCreate?.qrCode) {
        return { status: 'AGUARDANDO_QR', qrCode: afterCreate.qrCode };
      }
      const qr = await this.requestConnectQr(tenantId, true);
      if (qr) {
        this.cache.set(tenantId, { status: 'AGUARDANDO_QR', qrCode: qr });
        return { status: 'AGUARDANDO_QR', qrCode: qr };
      }
      return { status: 'AGUARDANDO_QR' };
    }

    if (state === 'open') {
      const info = await this.fetchInstanceInfo(tenantId);
      const entry: SessionCache = { status: 'CONECTADO', numero: info.numero };
      this.cache.set(tenantId, entry);
      return { status: 'CONECTADO', numero: info.numero };
    }

    const cached = this.cache.get(tenantId);
    const qrFromConnect = await this.requestConnectQr(tenantId, false);
    const qrCode = qrFromConnect ?? cached?.qrCode;
    if (qrCode) {
      this.cache.set(tenantId, { status: 'AGUARDANDO_QR', qrCode });
      return { status: 'AGUARDANDO_QR', qrCode };
    }

    if (state === 'connecting') {
      const entry: SessionCache = qrCode
        ? { status: 'AGUARDANDO_QR', qrCode }
        : { status: 'AGUARDANDO_QR' };
      this.cache.set(tenantId, entry);
      return entry;
    }

    if (state === 'close') {
      this.cache.set(tenantId, { status: 'CARREGANDO' });
      return { status: 'CARREGANDO' };
    }

    return { status: 'DESCONECTADO' };
  }

  /** Solicita novo QR via /connect (mantém a instância). */
  async atualizarQr(tenantId: string): Promise<WaSessionInfo> {
    const cached = this.cache.get(tenantId);
    if (cached?.status === 'CONECTADO') {
      throw new BusinessException(
        'WA_RENOVACAO_INVALIDA',
        'WhatsApp já está conectado. Para trocar o aparelho, use encerrar sessão.',
      );
    }
    if (!(await this.instanceExists(tenantId))) {
      return this.iniciar(tenantId);
    }
    const qr = await this.requestConnectQr(tenantId, true);
    if (qr) {
      this.cache.set(tenantId, { status: 'AGUARDANDO_QR', qrCode: qr });
      return { status: 'AGUARDANDO_QR', qrCode: qr };
    }
    this.logger.warn(`[ATUALIZAR_QR] /connect sem QR para ${tenantId.slice(0, 8)}… — recriando instância`);
    return this.renovarQr(tenantId);
  }

  async renovarQr(tenantId: string): Promise<WaSessionInfo> {
    const cached = this.cache.get(tenantId);
    if (cached?.status === 'CONECTADO') {
      throw new BusinessException(
        'WA_RENOVACAO_INVALIDA',
        'WhatsApp já está conectado. Para trocar o aparelho, use encerrar sessão.',
      );
    }
    this.logger.log(`[RENOVAR_QR] tenant=${tenantId.slice(0, 8)}…`);
    await this.deleteInstance(tenantId);
    this.cache.delete(tenantId);
    await this.delay(500);
    await this.recreateInstance(tenantId);
    const entry = this.cache.get(tenantId);
    if (entry?.qrCode) {
      return { status: 'AGUARDANDO_QR', qrCode: entry.qrCode };
    }
    const qr = await this.requestConnectQr(tenantId, true);
    if (qr) {
      this.cache.set(tenantId, { status: 'AGUARDANDO_QR', qrCode: qr });
      return { status: 'AGUARDANDO_QR', qrCode: qr };
    }
    return { status: 'AGUARDANDO_QR' };
  }

  async encerrar(tenantId: string): Promise<void> {
    try {
      await this.del(`/instance/logout/${tenantId}`);
    } catch { /* já desconectado */ }
    this.cache.delete(tenantId);
    this.webhookConfigured.delete(tenantId);
    this.lastConnectAt.delete(tenantId);
    this.logger.log(`Sessão WhatsApp encerrada para tenant ${tenantId}`);
  }

  private async assertConectado(tenantId: string): Promise<void> {
    const cached = this.cache.get(tenantId);
    if (cached?.status === 'CONECTADO') return;

    const state = await this.fetchConnectionState(tenantId);
    if (state !== 'open') {
      throw new BusinessException('WA_DESCONECTADO', 'WhatsApp não está conectado para este tenant');
    }
    const info = await this.fetchInstanceInfo(tenantId);
    this.cache.set(tenantId, { status: 'CONECTADO', numero: info.numero });
    this.logger.log(`[CACHE] sessão ${tenantId.slice(0, 8)}… sincronizada como CONECTADO (Evolution open)`);
  }

  async getGrupos(tenantId: string): Promise<WaGrupoListItem[]> {
    await this.assertConectado(tenantId);
    const raw = await this.get<unknown>(
      `/group/fetchAllGroups/${tenantId}?getParticipants=false`,
    );
    const groups = this.normalizeEvolutionGroups(raw);
    return groups.map(g => ({
      id:    g.id,
      nome:  g.subject,
      ...(g.size != null && { qtdParticipantes: g.size }),
    }));
  }

  /** Evolution v2 pode retornar array direto ou objeto com chave `groups`. */
  private normalizeEvolutionGroups(raw: unknown): { id: string; subject: string; size?: number }[] {
    if (Array.isArray(raw)) {
      return raw.filter(
        (g): g is { id: string; subject: string; size?: number } =>
          !!g && typeof g === 'object' && typeof (g as { id?: string }).id === 'string',
      );
    }
    if (raw && typeof raw === 'object') {
      const nested = (raw as Record<string, unknown>)['groups'];
      if (Array.isArray(nested)) return this.normalizeEvolutionGroups(nested);
    }
    return [];
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
    await this.assertConectado(tenantId);
    await this.post(`/message/sendText/${tenantId}`, { number, text });
  }

  // ── Webhook callbacks (chamados pelo WhatsAppWebhookController) ──

  onConnectionUpdate(tenantId: string, state: string, numero?: string): void {
    this.logger.log(`[CACHE] onConnectionUpdate tenant=${tenantId.slice(0,8)}... state="${state}" numero=${numero ?? '-'}`);
    if (state === 'open') {
      this.cache.set(tenantId, { status: 'CONECTADO', numero });
      this.logger.log(`[CACHE] → CONECTADO (${numero ?? '?'})`);
    } else if (state === 'close') {
      this.cache.set(tenantId, { status: 'DESCONECTADO' });
      this.logger.warn(`[CACHE] → DESCONECTADO`);
    } else {
      const cur = this.cache.get(tenantId);
      if (cur?.status !== 'CONECTADO') {
        const pairing = state === 'connecting';
        const next: SessionCache =
          cur?.qrCode
            ? { status: 'AGUARDANDO_QR', qrCode: cur.qrCode }
            : pairing
              ? { status: 'AGUARDANDO_QR' }
              : { status: 'CARREGANDO' };
        this.cache.set(tenantId, next);
        this.logger.log(`[CACHE] → ${next.status} (state=${state})`);
      }
    }
  }

  onQrUpdated(tenantId: string, qrPayload: string): void {
    const qrCode = this.normalizeQrPayload(qrPayload);
    this.logger.log(`[CACHE] onQrUpdated tenant=${tenantId.slice(0,8)}... qrLen=${qrCode.length}`);
    this.cache.set(tenantId, { status: 'AGUARDANDO_QR', qrCode });
    this.logger.log(`[CACHE] → AGUARDANDO_QR`);
  }

  // ── Helpers ───────────────────────────────────────────────────

  private normalizeQrPayload(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('data:image')) return trimmed;
    // PNG base64 do webhook Evolution (sem prefixo)
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 200) {
      return `data:image/png;base64,${trimmed}`;
    }
    return trimmed;
  }

  private extractQrFromConnectResponse(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const r = data as Record<string, unknown>;
    const count = r['count'];
    const hasCode = typeof r['code'] === 'string' || typeof r['pairingCode'] === 'string';
    const hasB64 = typeof r['base64'] === 'string';
    if (count === 0 && !hasCode && !hasB64) {
      return undefined;
    }
    const nested = r['qrcode'] as Record<string, unknown> | undefined;
    const base64 =
      (typeof r['base64'] === 'string' && r['base64']) ||
      (typeof nested?.['base64'] === 'string' && nested['base64']) ||
      undefined;
    if (base64) return this.normalizeQrPayload(base64);
    const code = typeof r['code'] === 'string' ? r['code'] : undefined;
    if (code) return code;
    return undefined;
  }

  private async requestConnectQr(tenantId: string, force = false): Promise<string | undefined> {
    const now = Date.now();
    const last = this.lastConnectAt.get(tenantId) ?? 0;
    if (!force && now - last < WhatsAppClientManager.CONNECT_COOLDOWN_MS) {
      return undefined;
    }
    this.lastConnectAt.set(tenantId, now);
    try {
      const data = await this.get<unknown>(`/instance/connect/${tenantId}`);
      const qr = this.extractQrFromConnectResponse(data);
      if (!qr && data && typeof data === 'object' && (data as Record<string, unknown>)['count'] === 0) {
        this.logger.warn(
          `[CONNECT] Evolution retornou count=0 sem QR para ${tenantId.slice(0, 8)}… — aguarde webhook QRCODE_UPDATED ou use Renovar QR`,
        );
      }
      return qr;
    } catch (err) {
      this.logger.debug(
        `connect ${tenantId.slice(0, 8)}…: ${err instanceof Error ? err.message : err}`,
      );
      return undefined;
    }
  }

  private parseNumeroFromJid(jid: string): string | undefined {
    const numero = jid.replace(/[^0-9]/g, '').replace(/:.*$/, '');
    return numero || undefined;
  }

  private async fetchInstanceInfo(tenantId: string): Promise<{ numero?: string }> {
    try {
      const list = await this.fetchInstances(tenantId);
      const inst = list.find(i => i.instanceName === tenantId);
      if (!inst?.ownerJid) return {};
      return { numero: this.parseNumeroFromJid(inst.ownerJid) };
    } catch {
      return {};
    }
  }
}
