import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CrmEtapasController } from './crm-etapas.controller';
import { CrmEtapasService } from './crm-etapas.service';
import { CrmContatosController } from './crm-contatos.controller';
import { CrmContatosService } from './crm-contatos.service';
import { CrmMensagensController } from './crm-mensagens.controller';
import { CrmMensagensService } from './crm-mensagens.service';

@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [CrmEtapasController, CrmContatosController, CrmMensagensController],
  providers: [CrmEtapasService, CrmContatosService, CrmMensagensService],
})
export class CrmModule {}
