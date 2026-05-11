import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { existsSync, readlinkSync, rmSync } from 'fs';
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

  // Serializa inicializações: dois Chrome simultâneos causam "detached Frame"
  private initChain: Promise<void> = Promise.resolve();

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

    this.limparLockOrfao(tenantId);

    // Encadeia na fila: próximo initialize() só começa após o anterior atingir QR/erro
    let sinalizarPronto!: () => void;
    const esteInit = new Promise<void>((resolve) => { sinalizarPronto = resolve; });
    this.initChain = this.initChain
      .then(() => new Promise<void>((r) => setTimeout(r, 2000))) // gap entre inits
      .then(() => esteInit);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: tenantId,
        dataPath: join(process.cwd(), '.wa-sessions'),
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      },
    });

    const entry: SessionEntry = { client, status: 'CARREGANDO' };
    this.sessions.set(tenantId, entry);

    let intentionalDestroy = false;

    const destruir = (): void => {
      intentionalDestroy = true;
      sinalizarPronto(); // libera fila mesmo em caso de erro
      client.removeAllListeners();
      this.sessions.delete(tenantId);
      void client.destroy().catch(() => undefined);
    };

    // Timeout somente para a fase CARREGANDO — QR gerado limpa o timeout
    const timeoutHandle = setTimeout(() => {
      if (entry.status === 'CARREGANDO') {
        this.logger.error(`Timeout na inicialização WhatsApp para tenant ${tenantId}`);
        entry.status = 'DESCONECTADO';
        destruir();
      }
    }, 90_000);

    client.on('loading_screen', (percent: number, message: string) => {
      this.logger.debug(`[${tenantId}] WAWeb carregando: ${percent}% — ${message}`);
    });

    client.on('qr', (qr: string) => {
      clearTimeout(timeoutHandle);
      sinalizarPronto(); // libera próximo da fila — Chrome já carregou WAWeb
      entry.status = 'AGUARDANDO_QR';
      entry.qrCode = qr;
      this.logger.debug(`QR gerado para tenant ${tenantId}`);
    });

    client.on('ready', () => {
      clearTimeout(timeoutHandle);
      sinalizarPronto(); // sessão restaurada de auth salvo (sem QR)
      entry.status = 'CONECTADO';
      delete entry.qrCode;
      const info = (client as Client & { info?: { wid?: { user?: string } } }).info;
      entry.numero = info?.wid?.user;
      this.logger.log(`Sessão WhatsApp pronta para tenant ${tenantId} (${entry.numero})`);
    });

    client.on('auth_failure', () => {
      clearTimeout(timeoutHandle);
      entry.status = 'DESCONECTADO';
      destruir();
      this.logger.warn(`Falha de autenticação WhatsApp para tenant ${tenantId}`);
    });

    client.on('disconnected', () => {
      clearTimeout(timeoutHandle);
      entry.status = 'DESCONECTADO';
      destruir();
      this.logger.warn(`WhatsApp desconectado para tenant ${tenantId}`);
    });

    client.initialize().catch((err: unknown) => {
      if (intentionalDestroy) return;
      clearTimeout(timeoutHandle);
      this.logger.error(`Falha ao inicializar WhatsApp para tenant ${tenantId}`, err);
      entry.status = 'DESCONECTADO';
      destruir();
    });

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
    entry.client.removeAllListeners();
    try {
      await entry.client.destroy();
    } catch {
      // Sessão pode já estar inválida
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

  private limparLockOrfao(tenantId: string): void {
    const sessionDir = join(process.cwd(), '.wa-sessions', `session-${tenantId}`);
    const lockFile = join(sessionDir, 'SingletonLock');
    if (!existsSync(lockFile)) return;

    try {
      // SingletonLock é symlink no formato "hostname-PID"
      const target = readlinkSync(lockFile);
      const pid = parseInt(target.split('-').pop() ?? '', 10);
      if (!isNaN(pid)) {
        process.kill(pid, 'SIGKILL');
        this.logger.warn(`Chrome órfão (PID ${pid}) encerrado para tenant ${tenantId}`);
      }
    } catch {
      // Processo já morto ou symlink ilegível — segue
    }

    // Limpa toda a pasta: tentativas anteriores corrompem o perfil Chrome
    rmSync(sessionDir, { recursive: true, force: true });
    this.logger.warn(`Pasta de sessão corrompida removida para tenant ${tenantId}`);
  }

  async onModuleDestroy(): Promise<void> {
    const tenants = [...this.sessions.keys()];
    await Promise.allSettled(tenants.map((t) => this.encerrar(t)));
  }
}
