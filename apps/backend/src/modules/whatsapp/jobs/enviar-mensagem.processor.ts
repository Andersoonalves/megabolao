import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppClientManager } from '../whatsapp-client-manager.service';
import { MetaCloudApiService } from '../whatsapp-meta.service';
import { ENVIAR_MENSAGEM_WA_QUEUE_NAME, EnviarMensagemJobData } from './enviar-mensagem.types';

// Delays anti-ban — ver docs/runbooks/whatsapp-anti-ban.md
const JITTER_MIN_MS  = 3_000;
const JITTER_MAX_MS  = 8_000;
const BAN_PAUSE_MS   = 60_000; // pausa extra antes de re-throw quando sinal de ban detectado

@Injectable()
export class EnviarMensagemProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnviarMensagemProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientManager: WhatsAppClientManager,
    private readonly metaApi: MetaCloudApiService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.worker = new Worker(
      ENVIAR_MENSAGEM_WA_QUEUE_NAME,
      (job) => this.processJob(job),
      // concurrency: 1 — nunca enviar mensagens em paralelo por instância
      { connection: { url: redisUrl }, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id} falhou: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }

  async processJob(job: Job<EnviarMensagemJobData>): Promise<void> {
    const { mensagemId, tenantId } = job.data;

    const mensagem = await this.prisma.mensagemWhatsapp.findFirst({
      where: { id: mensagemId, tenantId },
    });

    if (!mensagem) {
      this.logger.warn(`Mensagem ${mensagemId} não encontrada — job ignorado`);
      return;
    }

    if (mensagem.status === 'ENVIADO') {
      this.logger.debug(`Mensagem ${mensagemId} já enviada — job idempotente ignorado`);
      return;
    }

    // Anti-ban: jitter antes de cada envio para simular comportamento humano
    const jitter = JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
    this.logger.debug(`[ANTI-BAN] jitter=${jitter}ms tentativa=${job.attemptsMade + 1}`);
    await this.sleep(jitter);

    try {
      // Anti-ban: varia conteúdo com zero-width spaces — Evolution/Baileys
      // detecta mensagens 100% idênticas enviadas em sequência como spam
      const conteudo = this.varyContent(mensagem.conteudo);

      if (mensagem.grupoId) {
        // Grupo → Evolution API (mantém sessão Baileys existente)
        await this.clientManager.enviarParaGrupo(tenantId, mensagem.grupoId, conteudo);
      } else if (mensagem.celular) {
        // Individual → Meta Cloud API oficial
        await this.metaApi.enviarTexto(mensagem.celular, conteudo);
      } else {
        throw new Error(`Mensagem ${mensagemId} sem destino (grupoId e celular nulos)`);
      }

      await this.prisma.mensagemWhatsapp.update({
        where: { id: mensagemId },
        data: { status: 'ENVIADO', erro: null },
      });

      this.logger.log(`Mensagem ${mensagemId} enviada ao grupo ${mensagem.grupoId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isBan  = this.isBanSignal(errMsg);

      if (isBan) {
        // Pausa antes de re-throw: reduz velocidade de retry quando WhatsApp sinaliza bloqueio
        this.logger.warn(`[ANTI-BAN] sinal de bloqueio detectado — pausando ${BAN_PAUSE_MS}ms antes de retry`);
        await this.sleep(BAN_PAUSE_MS);
      }

      await this.prisma.mensagemWhatsapp.update({
        where: { id: mensagemId },
        data: {
          status: 'FALHA',
          tentativas: { increment: 1 },
          erro: isBan ? `[BAN_SIGNAL] ${errMsg}` : errMsg,
        },
      });

      throw err; // BullMQ aplica backoff exponencial (30s→60s→120s)
    }
  }

  // ── Helpers anti-ban ──────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Zero-width spaces únicos por envio — quebra fingerprint de conteúdo idêntico. */
  private varyContent(text: string): string {
    const n = 1 + Math.floor(Math.random() * 3); // 1–3 ZWS
    return text + ''.repeat(n);
  }

  /** Detecta sinais de rate limit / ban na resposta da Evolution API. */
  private isBanSignal(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
      lower.includes('429')      ||
      lower.includes('rate')     ||
      lower.includes('blocked')  ||
      lower.includes('banned')   ||
      lower.includes('spam')     ||
      lower.includes('broadcast')||
      lower.includes('too many')
    );
  }
}
