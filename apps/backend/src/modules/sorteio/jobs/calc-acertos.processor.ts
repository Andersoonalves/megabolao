import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { calcularAcertos } from '@nossobolao/shared-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CALC_ACERTOS_QUEUE_NAME, CalcAcertosJobData } from './calc-acertos.types';
import { SHEETS_SYNC_QUEUE } from '../../google-drive/jobs/sheets-sync.types';
import { WhatsAppMensagemService } from '../../whatsapp/whatsapp-mensagem.service';

const BATCH_SIZE = 500;

@Injectable()
export class CalcAcertosProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalcAcertosProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() @Inject(SHEETS_SYNC_QUEUE) private readonly syncQueue?: Queue,
    @Optional() private readonly waMensagemService?: WhatsAppMensagemService,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.worker = new Worker(
      CALC_ACERTOS_QUEUE_NAME,
      (job) => this.processJob(job),
      {
        connection: { url: redisUrl },
        concurrency: 2,
      },
    );
    // teste

    this.worker.on('completed', (job) =>
      this.logger.log(`Job ${job.id} concluído`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id} falhou: ${err.message}`, err.stack),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }

  // Público para testes
  async processJob(job: Job<CalcAcertosJobData>): Promise<void> {
    const { sorteioId, tenantId, bolaoId } = job.data;

    const sorteio = await this.prisma.sorteio.findFirst({
      where: { id: sorteioId, tenantId },
    });

    if (!sorteio) {
      this.logger.warn(`Sorteio ${sorteioId} não encontrado — job ignorado`);
      return;
    }

    // Idempotência: já processado → skip silencioso
    if (sorteio.processado) {
      this.logger.debug(`Sorteio ${sorteioId} já processado — job idempotente ignorado`);
      return;
    }

    const bolasSorteadas = sorteio.bolasSorteadas;
    let cursor: string | undefined;
    let totalProcessadas = 0;

    do {
      const cotas = await this.prisma.cota.findMany({
        where: { bolaoId, tenantId, statusPagamento: 'PAGO' },
        select: { id: true, palpites: true },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (cotas.length === 0) break;

      // UNIQUE(sorteio_id, cota_id) + skipDuplicates = idempotência garantida
      await this.prisma.acertoSorteio.createMany({
        data: cotas.map((cota) => ({
          tenantId,
          bolaoId,
          sorteioId,
          cotaId: cota.id,
          acertos: calcularAcertos(cota.palpites, bolasSorteadas),
        })),
        skipDuplicates: true,
      });

      totalProcessadas += cotas.length;
      cursor = cotas[cotas.length - 1].id;
      if (cotas.length < BATCH_SIZE) break;
    // eslint-disable-next-line no-constant-condition
    } while (true);

    // FROM + pre-aggregate evita correlated subquery (era 8515 loops → agora 1 HashAggregate)
    await this.prisma.$executeRaw`
      UPDATE cotas
      SET
        total_acertos_acumulados = agg.total,
        atualizado_em            = NOW()
      FROM (
        SELECT cota_id, COALESCE(SUM(acertos), 0)::INT AS total
        FROM acertos_sorteio
        WHERE tenant_id = ${tenantId}::UUID
          AND bolao_id  = ${bolaoId}::UUID
        GROUP BY cota_id
      ) agg
      WHERE cotas.id               = agg.cota_id
        AND cotas.bolao_id         = ${bolaoId}::UUID
        AND cotas.tenant_id        = ${tenantId}::UUID
        AND cotas.status_pagamento = 'PAGO'
    `;

    await this.prisma.sorteio.update({
      where: { id: sorteioId },
      data: { processado: true },
    });

    this.logger.log(
      `Sorteio ${sorteioId} (concurso ${sorteio.numeroConcurso}): ${totalProcessadas} cotas processadas`,
    );

    await this.verificarPremiacaoPrincipal(bolaoId, tenantId);

    // Trigger sheets sync after ranking is calculated
    if (this.syncQueue) {
      this.syncQueue.add('sync-ranking', { bolaoId, tenantId, trigger: 'RANKING' }, {
        jobId: `${bolaoId}-RANKING-${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      }).catch(() => {});
    }
  }

  private async verificarPremiacaoPrincipal(bolaoId: string, tenantId: string): Promise<void> {
    const bolao = await this.prisma.bolao.findFirst({
      where: { id: bolaoId, tenantId },
      select: { status: true, whatsappGrupos: true, qtdNumerosCota: true },
    });

    if (!bolao || bolao.status === 'PREMIADO' || bolao.status === 'FINALIZADO') return;

    const ganhador = await this.prisma.cota.findFirst({
      where: {
        bolaoId,
        tenantId,
        statusPagamento: 'PAGO',
        totalAcertosAcumulados: { gte: bolao.qtdNumerosCota },
      },
      select: { id: true },
    });

    if (!ganhador) return;

    await this.prisma.bolao.update({
      where: { id: bolaoId },
      data: { status: 'PREMIADO', atualizadoEm: new Date() },
    });

    this.logger.log(`Bolão ${bolaoId} marcado como PREMIADO — cota atingiu ${bolao.qtdNumerosCota} acertos`);

    if (!this.waMensagemService) return;

    const grupos = (bolao.whatsappGrupos as string[]) ?? [];
    const conteudo = `*BOLÃO PREMIADO* 🏆\nUm ganhador principal foi detectado!\nAcesse o painel para visualizar e calcular os prêmios.`;

    for (const grupoId of grupos) {
      await this.waMensagemService
        .enfileirar(tenantId, { grupoId, tipo: 'AVISO_ADMIN', conteudo, bolaoId })
        .catch((err: Error) => this.logger.warn(`Falha ao notificar grupo ${grupoId}: ${err.message}`));
    }
  }
}
