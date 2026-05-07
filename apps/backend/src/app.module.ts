import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthMiddleware } from './modules/auth/auth.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/auth.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { PrismaModule } from './modules/prisma/prisma.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { BolaoModule } from './modules/bolao/bolao.module';
import { ParticipanteModule } from './modules/participante/participante.module';
import { SorteioModule } from './modules/sorteio/sorteio.module';
import { PremioModule } from './modules/premio/premio.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    PrismaModule,
    AuthModule,
    TenantModule,
    BolaoModule,
    ParticipanteModule,
    SorteioModule,
    PremioModule,
    // Próximos: WhatsAppModule, GoogleDriveModule, RelatorioModule, PwaModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
