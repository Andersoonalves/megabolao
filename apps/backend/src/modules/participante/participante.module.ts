import { Module } from '@nestjs/common';
import { ParticipanteController } from './participante.controller';
import { ParticipanteService } from './participante.service';

@Module({
  controllers: [ParticipanteController],
  providers: [ParticipanteService],
  exports: [ParticipanteService],
})
export class ParticipanteModule {}
