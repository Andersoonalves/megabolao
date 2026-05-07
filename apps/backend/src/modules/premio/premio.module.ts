import { Module } from '@nestjs/common';
import { PremioController } from './premio.controller';
import { PremioService } from './premio.service';

@Module({
  controllers: [PremioController],
  providers: [PremioService],
  exports: [PremioService],
})
export class PremioModule {}
