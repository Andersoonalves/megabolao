import { Module } from '@nestjs/common';
import { BolaoController } from './bolao.controller';
import { BolaoService } from './bolao.service';
import { BolaoStatusScheduler } from './bolao-status.scheduler';
import { TenantModule } from '../tenant/tenant.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [TenantModule, WhatsAppModule],
  controllers: [BolaoController],
  providers: [BolaoService, BolaoStatusScheduler],
  exports: [BolaoService],
})
export class BolaoModule {}
