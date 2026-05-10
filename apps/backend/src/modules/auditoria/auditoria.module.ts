import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
