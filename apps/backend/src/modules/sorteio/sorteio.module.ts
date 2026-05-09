import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SorteioController } from './sorteio.controller';
import { SorteioGlobalController } from './sorteio-global.controller';
import { SorteioService } from './sorteio.service';
import { CalcAcertosProcessor } from './jobs/calc-acertos.processor';
import { CALC_ACERTOS_QUEUE, CALC_ACERTOS_QUEUE_NAME } from './jobs/calc-acertos.types';

@Module({
  controllers: [SorteioController, SorteioGlobalController],
  providers: [
    {
      provide: CALC_ACERTOS_QUEUE,
      useFactory: (config: ConfigService) =>
        new Queue(CALC_ACERTOS_QUEUE_NAME, {
          connection: { url: config.get<string>('REDIS_URL', 'redis://localhost:6379') },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        }),
      inject: [ConfigService],
    },
    SorteioService,
    CalcAcertosProcessor,
  ],
  exports: [SorteioService],
})
export class SorteioModule {}
