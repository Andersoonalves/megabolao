import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, readdirSync, readlinkSync, rmSync } from 'fs';
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

export interface WaGrupoListItem {
  id: string;
  nome: string;
  qtdParticipantes?: number;
}

function countGroupParticipantsFromChat(chat: {
  isGroup: boolean;
  groupMetadata?: { participants?: unknown };
  participants?: unknown;
}): number | undefined {
  if (!chat.isGroup) return undefined;
  try {
    const raw = chat.participants ?? chat.groupMetadata?.participants;
    if (raw == null) return undefined;
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === 'object') {
      const o = raw as { length?: unknown; size?: unknown; models?: unknown };
      if (typeof o.length === 'number') return o.length;
      if (typeof o.size === 'number') return o.size;
      if (Array.isArray(o.models)) return o.models.length;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class WhatsAppClientManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppClientManager.name);
  private readonly sessions = new Map<string, SessionEntry>();

  // Fila garante que só um Chrome inicializa por vez — inits simultâneos causam "detached Frame"
  private initChain: Promise<void> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    const sessionsBase = join(process.cwd(), '.wa-sessions');
    if (!existsSync(sessionsBase)) return;

    const entries = readdirSync(sessionsBase, { withFileTypes: true });
    const tenantIds = entries
      .filter((e) => e.isDirectory() && e.name.startsWith('session-'))
      .map((e) => e.name.replace('session-', ''));

    for (const tenantId of tenantIds) {
      this.logger.log(`Auto-reconectando WhatsApp para tenant ${tenantId}`);
      void this.iniciar(tenantId);
    }
  }

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

    let intentionalDestroy = false;
    let sinalizarPronto!: () => void;
    const prontoParaProximo = new Promise<void>((resolve) => { sinalizarPronto = resolve; });

    // Timeout via ref — iniciado só quando o Chrome realmente sobe (dentro da fila)
    const timeoutRef = { handle: null as ReturnType<typeof setTimeout> | null };

    const destruir = (): void => {
      if (timeoutRef.handle) clearTimeout(timeoutRef.handle);
      intentionalDestroy = true;
      sinalizarPronto();
      client.removeAllListeners();
      this.sessions.delete(tenantId);
      void client.destroy().catch(() => undefined);
    };

    client.on('loading_screen', (percent: number, message: string) => {
      this.logger.debug(`[${tenantId}] WAWeb carregando: ${percent}% — ${message}`);
    });

    client.on('qr', (qr: string) => {
      if (timeoutRef.handle) clearTimeout(timeoutRef.handle);
      sinalizarPronto(); // libera próximo da fila — Chrome carregou WAWeb
      entry.status = 'AGUARDANDO_QR';
      entry.qrCode = qr;
    });

    client.on('ready', () => {
      if (timeoutRef.handle) clearTimeout(timeoutRef.handle);
      sinalizarPronto(); // auth salvo restaurado — sem QR
      entry.status = 'CONECTADO';
      delete entry.qrCode;
      const info = (client as Client & { info?: { wid?: { user?: string } } }).info;
      entry.numero = info?.wid?.user;
      this.logger.log(`Sessão WhatsApp pronta para tenant ${tenantId} (${entry.numero})`);
    });

    client.on('auth_failure', () => {
      entry.status = 'DESCONECTADO';
      destruir();
      this.logger.warn(`Falha de autenticação WhatsApp para tenant ${tenantId}`);
    });

    client.on('disconnected', () => {
      entry.status = 'DESCONECTADO';
      destruir();
      this.logger.warn(`WhatsApp desconectado para tenant ${tenantId}`);
    });

    // initialize() entra na fila — só roda após tenant anterior atingir QR/ready/erro
    this.initChain = this.initChain
      .then(() => new Promise<void>((r) => setTimeout(r, 2000)))
      .then(async () => {
        if (!this.sessions.has(tenantId)) {
          sinalizarPronto(); // sessão cancelada enquanto aguardava na fila
          return;
        }

        await this.limparLockOrfao(tenantId);

        // Timeout começa só agora — quando o Chrome realmente vai subir
        timeoutRef.handle = setTimeout(() => {
          if (entry.status === 'CARREGANDO') {
            this.logger.error(`Timeout na inicialização WhatsApp para tenant ${tenantId}`);
            entry.status = 'DESCONECTADO';
            destruir();
          }
        }, 90_000);

        const initPromise = client.initialize();
        if (initPromise != null && typeof initPromise.catch === 'function') {
          void initPromise.catch((err: unknown) => {
            if (intentionalDestroy) return;
            if (timeoutRef.handle) clearTimeout(timeoutRef.handle);
            this.logger.error(`Falha ao inicializar WhatsApp para tenant ${tenantId}`, err);
            entry.status = 'DESCONECTADO';
            destruir();
          });
        }

        return prontoParaProximo;
      });

    return { status: 'CARREGANDO' };
  }

  getStatus(tenantId: string): WaSessionInfo {
    const entry = this.sessions.get(tenantId);
    if (!entry) return { status: 'DESCONECTADO' };
    return { status: entry.status, qrCode: entry.qrCode, numero: entry.numero };
  }

  /**
   * Encerra a sessão e abre outra para emitir um **novo** QR (o anterior expira no WA Web após algum tempo).
   * Só em `AGUARDANDO_QR` ou `CARREGANDO` — nunca desconecta um tenant já `CONECTADO`.
   */
  async renovarQr(tenantId: string): Promise<WaSessionInfo> {
    const entry = this.sessions.get(tenantId);
    if (entry?.status === 'CONECTADO') {
      throw new BusinessException(
        'WA_RENOVACAO_INVALIDA',
        'WhatsApp já está conectado. Para trocar o aparelho, use encerrar sessão.',
      );
    }
    await this.encerrar(tenantId);
    // Dar tempo ao Puppeteer/Chrome fechar antes de subir novo processo
    await new Promise<void>((r) => setTimeout(r, 400));
    return this.iniciar(tenantId);
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

  async getGrupos(tenantId: string): Promise<WaGrupoListItem[]> {
    const entry = this.sessions.get(tenantId);
    if (!entry || entry.status !== 'CONECTADO') {
      throw new BusinessException('WA_DESCONECTADO', 'WhatsApp não está conectado para este tenant');
    }
    const chats = await entry.client.getChats();
    return chats
      .filter((c) => c.isGroup)
      .map((c) => {
        const n = countGroupParticipantsFromChat(c as { isGroup: boolean; groupMetadata?: { participants?: unknown }; participants?: unknown });
        return {
          id: c.id._serialized,
          nome: c.name,
          ...(n !== undefined ? { qtdParticipantes: n } : {}),
        };
      });
  }

  async enviarParaGrupo(tenantId: string, grupoId: string, mensagem: string): Promise<void> {
    const entry = this.sessions.get(tenantId);
    if (!entry || entry.status !== 'CONECTADO') {
      throw new BusinessException('WA_DESCONECTADO', 'WhatsApp não está conectado para este tenant');
    }
    await entry.client.sendMessage(grupoId, mensagem);
  }

  private async limparLockOrfao(tenantId: string): Promise<void> {
    const sessionDir = join(process.cwd(), '.wa-sessions', `session-${tenantId}`);
    const lockFile = join(sessionDir, 'SingletonLock');

    if (!existsSync(lockFile)) return;

    // SingletonLock é symlink no formato "hostname-PID" — extrair PID diretamente
    try {
      const target = readlinkSync(lockFile);
      const pid = parseInt(target.split('-').pop() ?? '', 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
          // Aguarda processo morrer antes de deletar locks —
          // Chrome recria o SingletonLock se detecta que foi removido enquanto vivo
          for (let i = 0; i < 40; i++) {
            try {
              process.kill(pid, 0); // sinal 0 = verificar se processo existe
              await new Promise<void>((r) => setTimeout(r, 50));
            } catch {
              break; // ESRCH = processo morto
            }
          }
          this.logger.warn(`Chrome órfão (PID ${pid}) encerrado para tenant ${tenantId}`);
        } catch {
          // Processo já morto
        }
      }
    } catch {
      // Lock não é symlink — segue para limpeza
    }

    // Deleta todos os locks DEPOIS que o processo morreu — preserva auth em Default/
    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort']) {
      const f = join(sessionDir, name);
      if (existsSync(f)) rmSync(f);
    }
    this.logger.warn(`Locks removidos para tenant ${tenantId}`);
  }

  async onModuleDestroy(): Promise<void> {
    const tenants = [...this.sessions.keys()];
    await Promise.allSettled(tenants.map((t) => this.encerrar(t)));
  }
}
