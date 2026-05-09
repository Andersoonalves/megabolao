import { Module } from '@nestjs/common';
import { ParticipanteController } from './participante.controller';
import { ParticipanteService } from './participante.service';
import { BancoParticipanteController } from './banco-participante.controller';
import { BancoParticipanteService } from './banco-participante.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [ParticipanteController, BancoParticipanteController],
  providers: [ParticipanteService, BancoParticipanteService],
  exports: [ParticipanteService, BancoParticipanteService],
})
export class ParticipanteModule {}
