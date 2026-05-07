import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppClientManager } from '../whatsapp-client-manager.service';
import { ENVIAR_MENSAGEM_WA_QUEUE_NAME, EnviarMensagemJobData } from './enviar-mensagem.types';

@Injectable()
export class EnviarMensagemProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnviarMensagemProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientManager: WhatsAppClientManager,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.worker = new Worker(
      ENVIAR_MENSAGEM_WA_QUEUE_NAME,
      (job) => this.processJob(job),
      { connection: { url: redisUrl }, concurrency: 1 }, // 1: evita flood no WhatsApp
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

    try {
      await this.clientManager.enviarParaGrupo(tenantId, mensagem.grupoId!, mensagem.conteudo);

      await this.prisma.mensagemWhatsapp.update({
        where: { id: mensagemId },
        data: { status: 'ENVIADO', erro: null },
      });

      this.logger.log(`Mensagem ${mensagemId} enviada ao grupo ${mensagem.grupoId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      await this.prisma.mensagemWhatsapp.update({
        where: { id: mensagemId },
        data: {
          status: 'FALHA',
          tentativas: { increment: 1 },
          erro: errMsg,
        },
      });

      throw err; // Re-throw para BullMQ executar retry com backoff
    }
  }
}
