import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleDriveService } from '../google-drive.service';
import { SHEETS_SYNC_QUEUE_NAME, SheetsSyncJobData } from './sheets-sync.types';

@Injectable()
export class SheetsSyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SheetsSyncProcessor.name);
  private worker!: Worker;

  constructor(
    private readonly prisma:       PrismaService,
    private readonly config:       ConfigService,
    private readonly driveService: GoogleDriveService,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.worker = new Worker(
      SHEETS_SYNC_QUEUE_NAME,
      (job) => this.processJob(job),
      { connection: { url: redisUrl }, concurrency: 1 },
    );

    this.worker.on('completed', (job) =>
      this.logger.log(`SheetsSync job ${job.id} concluído (trigger: ${job.data.trigger})`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`SheetsSync job ${job?.id} falhou: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }

  async processJob(job: Job<SheetsSyncJobData>): Promise<void> {
    const { bolaoId, tenantId, trigger } = job.data;

    const bolao = await this.prisma.bolao.findFirst({
      where: { id: bolaoId, tenantId },
      select: { id: true, sheetsSpreadsheetId: true, sheetsAtivo: true },
    });

    if (!bolao?.sheetsAtivo || !bolao.sheetsSpreadsheetId) {
      this.logger.debug(`Bolão ${bolaoId} sem planilha vinculada ou sync inativo — job ignorado`);
      return;
    }

    this.logger.log(`Sincronizando bolão ${bolaoId} → ${bolao.sheetsSpreadsheetId} (trigger: ${trigger})`);

    try {
      await this.driveService.exportarCompleto(tenantId, bolaoId, {
        spreadsheetId: bolao.sheetsSpreadsheetId,
      });

      await this.prisma.bolao.update({
        where: { id: bolaoId },
        data: { sheetsUltimaSyncAt: new Date(), sheetsUltimoErro: null },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao sincronizar bolão ${bolaoId}: ${msg}`);
      await this.prisma.bolao.update({
        where: { id: bolaoId },
        data: { sheetsUltimoErro: msg },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      }).catch(() => {});
      throw err; // propaga para BullMQ fazer retry
    }
  }
}
