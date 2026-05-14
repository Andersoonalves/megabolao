import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthMiddleware } from './auth.middleware';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { MfaGuard } from './mfa.guard';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { RolesGuard } from './roles.guard';
import { PermissoesGuard } from './permissoes.guard';

@Module({
  imports: [SupabaseModule, PrismaModule],
  controllers: [MfaController],
  providers: [AuthService, MfaService, AuthMiddleware, JwtAuthGuard, MfaGuard, RolesGuard, PermissoesGuard],
  exports: [AuthService, MfaService, AuthMiddleware, JwtAuthGuard, MfaGuard, RolesGuard, PermissoesGuard],
})
export class AuthModule {}
