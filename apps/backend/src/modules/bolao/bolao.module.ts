import { Module } from '@nestjs/common';
import { BolaoController } from './bolao.controller';
import { BolaoService } from './bolao.service';
import { BolaoStatusScheduler } from './bolao-status.scheduler';

@Module({
  controllers: [BolaoController],
  providers: [BolaoService, BolaoStatusScheduler],
  exports: [BolaoService],
})
export class BolaoModule {}
