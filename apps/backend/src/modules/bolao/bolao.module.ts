import { Module } from '@nestjs/common';
import { BolaoController } from './bolao.controller';
import { BolaoService } from './bolao.service';

@Module({
  controllers: [BolaoController],
  providers: [BolaoService],
  exports: [BolaoService],
})
export class BolaoModule {}
