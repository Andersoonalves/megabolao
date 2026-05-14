import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SorteioService } from '../sorteio.service';
import { CHECK_MEGA_SENA_QUEUE, CHECK_MEGA_SENA_QUEUE_NAME } from './check-mega-sena.types';

const REPEAT_EVERY_MS = 30 * 60 * 1000; // 30 minutos

@Injectable()
export class CheckMegaSenaProcessor implements OnModuleInit {
  private readonly logger = new Logger(CheckMegaSenaProcessor.name);
  private worker!: Worker;

  constructor(
    @Inject(CHECK_MEGA_SENA_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly sorteioService: SorteioService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.worker = new Worker(
      CHECK_MEGA_SENA_QUEUE_NAME,
      async (job: Job) => this.process(job),
      { connection: { url: redisUrl }, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} falhou: ${err.message}`);
    });

    // Agenda job repetível — ignora se já existe
    await this.queue.add(
      'check',
      {},
      {
        jobId: 'check-mega-sena-global',
        repeat: { every: REPEAT_EVERY_MS },
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );

    this.logger.log('Check Mega-Sena agendado a cada 30min');

    // Roda imediatamente na primeira inicialização
    await this.queue.add('check-inicial', {}, { jobId: `check-mega-sena-boot-${Date.now()}` });
  }

  private async process(_job: Job): Promise<void> {
    this.logger.debug('Verificando novo resultado Mega-Sena na Caixa...');

    let resultado: { numeroConcurso: number; dataSorteio: string; bolasSorteadas: number[] };
    try {
      const res = await this.sorteioService.buscarMegaSena(undefined, undefined);
      resultado = Array.isArray(res) ? res[0] : res as typeof resultado;
    } catch (err) {
      this.logger.warn(`Falha ao buscar resultado da Caixa: ${(err as Error).message}`);
      return;
    }

    // Verifica se já temos este resultado
    const existing = await this.prisma.megaResultado.findUnique({
      where: { numeroConcurso: resultado.numeroConcurso },
    });

    if (existing) {
      this.logger.debug(`Concurso ${resultado.numeroConcurso} já registrado — nenhuma ação`);
      return;
    }

    // Novo resultado! Persiste globalmente
    await this.prisma.megaResultado.create({
      data: {
        numeroConcurso: resultado.numeroConcurso,
        dataSorteio:    new Date(resultado.dataSorteio),
        bolasSorteadas: resultado.bolasSorteadas,
      },
    });

    this.logger.log(`Novo resultado Mega-Sena detectado: concurso ${resultado.numeroConcurso}`);

    // Auto-apply para tenants configurados
    const tenantsAutoApply = await this.prisma.tenant.findMany({
      where: { status: 'ATIVO', sorteioAutoApply: true },
      select: { id: true, nome: true },
    });

    for (const tenant of tenantsAutoApply) {
      try {
        const r = await this.sorteioService.registrarGlobal(tenant.id, {
          numeroConcurso: resultado.numeroConcurso,
          dataSorteio:    resultado.dataSorteio,
          bolasSorteadas: resultado.bolasSorteadas,
        });
        this.logger.log(
          `Auto-apply concurso ${resultado.numeroConcurso} → tenant ${tenant.nome}: ${r.bolaoesProcessados} bolão(ões)`,
        );
      } catch (err) {
        this.logger.warn(
          `Auto-apply falhou para tenant ${tenant.nome}: ${(err as Error).message}`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
