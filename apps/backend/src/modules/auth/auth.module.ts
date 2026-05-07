import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthMiddleware } from './auth.middleware';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [SupabaseModule],
  providers: [AuthService, AuthMiddleware, JwtAuthGuard, RolesGuard],
  exports: [AuthService, AuthMiddleware, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
