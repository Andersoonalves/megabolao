import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SorteioService } from '../sorteio.service';
import { CHECK_MEGA_SENA_QUEUE, CHECK_MEGA_SENA_QUEUE_NAME } from './check-mega-sena.types';
import type { MegaSenaCaixaMetaDto, MegaSenaResultadoCaixaDto } from '../dto/mega-sena-painel.dto';

type CaixaMeta = MegaSenaResultadoCaixaDto & MegaSenaCaixaMetaDto;

// Mega-Sena sorteios em 2026: terça, quinta e sábado às 21:00 BRT (UTC-3).
// Polls durante a janela 21:00–23:59 BRT, a cada 1 hora.
// Fora da janela o job executa mas retorna imediatamente.
const REPEAT_EVERY_MS = 60 * 60 * 1000; // 1 hora
const DRAW_DAYS_BRT = new Set([2, 4, 6]); // 2=terça, 4=quinta, 6=sábado
const DRAW_START_HOUR_BRT = 21;
const DRAW_END_HOUR_BRT = 23;
const CACHE_MIN_SIZE = 20;

/** Retorna true se estamos dentro da janela de sorteio em horário de Brasília (UTC-3). */
function isDrawWindow(): boolean {
  const now = new Date();
  // BRT não tem horário de verão desde 2019 — fixo UTC-3
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const day = brt.getUTCDay();
  const hour = brt.getUTCHours();
  return DRAW_DAYS_BRT.has(day) && hour >= DRAW_START_HOUR_BRT && hour <= DRAW_END_HOUR_BRT;
}

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

    this.logger.log('Check Mega-Sena agendado a cada 1h (auto-apply ativo Ter/Qui/Sáb 21h–23h BRT)');

    // Boot: popula cache se vazio, independente da janela de sorteio
    await this.queue.add('check-boot', { boot: true }, { jobId: `check-mega-sena-boot-${Date.now()}` });
  }

  private async process(job: Job<{ boot?: boolean }>): Promise<void> {
    const isBoot = job.data?.boot === true;

    const cacheCount = await this.prisma.megaResultado.count();

    if (isBoot && cacheCount >= CACHE_MIN_SIZE) {
      this.logger.debug(`Cache OK (${cacheCount} registros) — boot sem chamada à Caixa`);
      return;
    }

    if (cacheCount < CACHE_MIN_SIZE) {
      this.logger.log(`Cache com ${cacheCount} registros — populando com últimos ${CACHE_MIN_SIZE} concursos`);
      await this.sorteioService.popularCache(CACHE_MIN_SIZE);
      if (isBoot) return;
    }

    // Sempre verifica se há novo resultado (atualiza cache)
    // A janela de sorteio controla apenas o auto-apply para tenants
    await this.verificarNovoResultado();
  }

  private async verificarNovoResultado(): Promise<void> {
    this.logger.debug('Verificando novo resultado Mega-Sena na Caixa...');

    let resultado: CaixaMeta;
    try {
      const res = await this.sorteioService.buscarMegaSenaComMeta(undefined, 1);
      resultado = res[0];
    } catch (err) {
      this.logger.warn(`Falha ao buscar resultado da Caixa: ${(err as Error).message}`);
      return;
    }

    const existing = await this.prisma.megaResultado.findUnique({
      where: { numeroConcurso: resultado.numeroConcurso },
    });

    if (existing) {
      this.logger.debug(`Concurso ${resultado.numeroConcurso} já no cache — nenhuma ação`);
      return;
    }

    await this.prisma.megaResultado.create({ data: this.toCreateData(resultado) });
    this.logger.log(`Novo resultado Mega-Sena: concurso ${resultado.numeroConcurso}`);

    // Auto-apply apenas dentro da janela de sorteio
    if (!isDrawWindow()) {
      this.logger.debug('Fora da janela de sorteio — cache atualizado, sem auto-apply');
      return;
    }

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
        this.logger.warn(`Auto-apply falhou para tenant ${tenant.nome}: ${(err as Error).message}`);
      }
    }
  }

  private toCreateData(r: CaixaMeta) {
    return {
      numeroConcurso:        r.numeroConcurso,
      dataSorteio:           new Date(r.dataSorteio),
      bolasSorteadas:        r.bolasSorteadas,
      ganhadores:            r.ganhadoresSena,
      acumulado:             r.acumulado,
      valorArrecadado:       r.valorArrecadado ?? null,
      estimativaProximo:     r.estimativaProximoConcurso ?? null,
      dataProximoConcurso:   r.dataProximoConcurso ?? null,
      numeroConcursoProximo: r.numeroConcursoProximo ? Number(r.numeroConcursoProximo) : null,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
