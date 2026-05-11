import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveService } from './google-drive.service';
import { SheetsSyncProcessor } from './jobs/sheets-sync.processor';
import { SHEETS_SYNC_QUEUE, SHEETS_SYNC_QUEUE_NAME } from './jobs/sheets-sync.types';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [GoogleDriveController],
  providers: [
    {
      provide: SHEETS_SYNC_QUEUE,
      useFactory: (config: ConfigService) =>
        new Queue(SHEETS_SYNC_QUEUE_NAME, {
          connection: { url: config.get<string>('REDIS_URL', 'redis://localhost:6379') },
          defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 10000 } },
        }),
      inject: [ConfigService],
    },
    GoogleDriveService,
    SheetsSyncProcessor,
  ],
  exports: [GoogleDriveService, SHEETS_SYNC_QUEUE],
})
export class GoogleDriveModule {}
