import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BolaoStatusScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BolaoStatusScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Executa imediatamente ao iniciar e depois a cada 5 minutos
    void this.atualizarStatus();
    this.timer = setInterval(() => void this.atualizarStatus(), 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async atualizarStatus(): Promise<void> {
    try {
      const agora = new Date();

      // A_SER_INICIADO → EM_ANDAMENTO quando dataInicio <= agora
      const iniciados = await this.prisma.bolao.updateMany({
        where: {
          status:    'A_SER_INICIADO',
          dataInicio: { lte: agora },
        },
        data: { status: 'EM_ANDAMENTO' },
      });

      if (iniciados.count > 0) {
        this.logger.log(`${iniciados.count} bolão(s) iniciado(s) automaticamente`);
      }
    } catch (err) {
      this.logger.error('Erro ao atualizar status dos bolões', err);
    }
  }
}
