import { Module } from '@nestjs/common';
import { PwaController } from './pwa.controller';
import { PwaService } from './pwa.service';

@Module({
  controllers: [PwaController],
  providers: [PwaService],
})
export class PwaModule {}
