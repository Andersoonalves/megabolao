import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Executa a cada 3 dias às 12:00 UTC
  @Cron('0 12 */3 * *')
  async keepDatabaseAlive(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.logger.log('Keep-alive: Supabase ping OK');
    } catch (err) {
      this.logger.error('Keep-alive: Falha ao pingar Supabase', err);
    }
  }
}
