import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WhatsAppClientManager } from './whatsapp-client-manager.service';
import { WhatsAppMensagemService } from './whatsapp-mensagem.service';
import { WhatsAppSessionController } from './whatsapp-session.controller';
import { WhatsAppMensagemController } from './whatsapp-mensagem.controller';
import { EnviarMensagemProcessor } from './jobs/enviar-mensagem.processor';
import { ENVIAR_MENSAGEM_WA_QUEUE, ENVIAR_MENSAGEM_WA_QUEUE_NAME } from './jobs/enviar-mensagem.types';

@Module({
  controllers: [WhatsAppSessionController, WhatsAppMensagemController],
  providers: [
    {
      provide: ENVIAR_MENSAGEM_WA_QUEUE,
      useFactory: (config: ConfigService) =>
        new Queue(ENVIAR_MENSAGEM_WA_QUEUE_NAME, {
          connection: { url: config.get<string>('REDIS_URL', 'redis://localhost:6379') },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10000 },
          },
        }),
      inject: [ConfigService],
    },
    WhatsAppClientManager,
    WhatsAppMensagemService,
    EnviarMensagemProcessor,
  ],
  exports: [WhatsAppMensagemService, WhatsAppClientManager],
})
export class WhatsAppModule {}
