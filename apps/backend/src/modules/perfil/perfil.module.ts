import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PermissaoModule } from '../permissao/permissao.module';
import { PerfilController } from './perfil.controller';
import { PerfilService } from './perfil.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditoriaModule, PermissaoModule],
  controllers: [PerfilController],
  providers: [PerfilService],
  exports: [PerfilService],
})
export class PerfilModule {}
