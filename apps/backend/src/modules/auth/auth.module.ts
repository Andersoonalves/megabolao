import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthMiddleware } from './auth.middleware';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { PermissoesGuard } from './permissoes.guard';

@Module({
  imports: [SupabaseModule, PrismaModule],
  providers: [AuthService, AuthMiddleware, JwtAuthGuard, RolesGuard, PermissoesGuard],
  exports: [AuthService, AuthMiddleware, JwtAuthGuard, RolesGuard, PermissoesGuard],
})
export class AuthModule {}
