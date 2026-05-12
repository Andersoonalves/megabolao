import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
