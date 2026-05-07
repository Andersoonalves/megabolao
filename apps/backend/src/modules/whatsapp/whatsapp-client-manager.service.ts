import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { join } from 'path';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { BusinessException } from '../../common/exceptions/business.exception';

export type WaSessionStatus = 'DESCONECTADO' | 'CARREGANDO' | 'AGUARDANDO_QR' | 'CONECTADO';

export interface WaSessionInfo {
  status: WaSessionStatus;
  qrCode?: string;
  numero?: string;
}

interface SessionEntry {
  client: Client;
  status: WaSessionStatus;
  qrCode?: string;
  numero?: string;
}

@Injectable()
export class WhatsAppClientManager implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppClientManager.name);
  private readonly sessions = new Map<string, SessionEntry>();

  async iniciar(tenantId: string): Promise<WaSessionInfo> {
    const existing = this.sessions.get(tenantId);
    if (existing?.status === 'CONECTADO') {
      return { status: 'CONECTADO', numero: existing.numero };
    }
    if (existing?.status === 'AGUARDANDO_QR' && existing.qrCode) {
      return { status: 'AGUARDANDO_QR', qrCode: existing.qrCode };
    }
    if (existing?.status === 'CARREGANDO') {
      return { status: 'CARREGANDO' };
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: tenantId,
        dataPath: join(process.cwd(), '.wa-sessions'),
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
    });

    const entry: SessionEntry = { client, status: 'CARREGANDO' };
    this.sessions.set(tenantId, entry);

    client.on('qr', (qr: string) => {
      entry.status = 'AGUARDANDO_QR';
      entry.qrCode = qr;
      this.logger.debug(`QR gerado para tenant ${tenantId}`);
    });

    client.on('ready', () => {
      entry.status = 'CONECTADO';
      delete entry.qrCode;
      const info = (client as Client & { info?: { wid?: { user?: string } } }).info;
      entry.numero = info?.wid?.user;
      this.logger.log(`Sessão WhatsApp pronta para tenant ${tenantId} (${entry.numero})`);
    });

    client.on('auth_failure', () => {
      entry.status = 'DESCONECTADO';
      this.sessions.delete(tenantId);
      this.logger.warn(`Falha de autenticação WhatsApp para tenant ${tenantId}`);
    });

    client.on('disconnected', () => {
      entry.status = 'DESCONECTADO';
      this.sessions.delete(tenantId);
      this.logger.warn(`WhatsApp desconectado para tenant ${tenantId}`);
    });

    void client.initialize(); // Assíncrono — progresso via getStatus() polling
    return { status: 'CARREGANDO' };
  }

  getStatus(tenantId: string): WaSessionInfo {
    const entry = this.sessions.get(tenantId);
    if (!entry) return { status: 'DESCONECTADO' };
    return { status: entry.status, qrCode: entry.qrCode, numero: entry.numero };
  }

  async encerrar(tenantId: string): Promise<void> {
    const entry = this.sessions.get(tenantId);
    if (!entry) return;
    try {
      await entry.client.destroy();
    } catch {
      // Ignora erros ao destruir — sessão pode já estar inválida
    }
    this.sessions.delete(tenantId);
    this.logger.log(`Sessão WhatsApp encerrada para tenant ${tenantId}`);
  }

  async getGrupos(tenantId: string): Promise<{ id: string; nome: string }[]> {
    const entry = this.sessions.get(tenantId);
    if (!entry || entry.status !== 'CONECTADO') {
      throw new BusinessException('WA_DESCONECTADO', 'WhatsApp não está conectado para este tenant');
    }
    const chats = await entry.client.getChats();
    return chats
      .filter((c) => c.isGroup)
      .map((c) => ({ id: c.id._serialized, nome: c.name }));
  }

  async enviarParaGrupo(tenantId: string, grupoId: string, mensagem: string): Promise<void> {
    const entry = this.sessions.get(tenantId);
    if (!entry || entry.status !== 'CONECTADO') {
      throw new BusinessException('WA_DESCONECTADO', 'WhatsApp não está conectado para este tenant');
    }
    await entry.client.sendMessage(grupoId, mensagem);
  }

  async onModuleDestroy(): Promise<void> {
    const tenants = [...this.sessions.keys()];
    await Promise.allSettled(tenants.map((t) => this.encerrar(t)));
  }
}
