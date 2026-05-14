import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SorteioController } from './sorteio.controller';
import { SorteioGlobalController } from './sorteio-global.controller';
import { SorteioService } from './sorteio.service';
import { CalcAcertosProcessor } from './jobs/calc-acertos.processor';
import { CALC_ACERTOS_QUEUE, CALC_ACERTOS_QUEUE_NAME } from './jobs/calc-acertos.types';
import { CheckMegaSenaProcessor } from './jobs/check-mega-sena.processor';
import { CHECK_MEGA_SENA_QUEUE, CHECK_MEGA_SENA_QUEUE_NAME } from './jobs/check-mega-sena.types';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

function makeBullQueue(name: string) {
  return {
    provide: name === CALC_ACERTOS_QUEUE_NAME ? CALC_ACERTOS_QUEUE : CHECK_MEGA_SENA_QUEUE,
    useFactory: (config: ConfigService) =>
      new Queue(name, {
        connection: { url: config.get<string>('REDIS_URL', 'redis://localhost:6379') },
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      }),
    inject: [ConfigService],
  };
}

@Module({
  imports: [GoogleDriveModule],
  controllers: [SorteioController, SorteioGlobalController],
  providers: [
    makeBullQueue(CALC_ACERTOS_QUEUE_NAME),
    makeBullQueue(CHECK_MEGA_SENA_QUEUE_NAME),
    SorteioService,
    CalcAcertosProcessor,
    CheckMegaSenaProcessor,
  ],
  exports: [SorteioService],
})
export class SorteioModule {}
