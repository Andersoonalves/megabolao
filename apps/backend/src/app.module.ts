import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { MfaGuard } from './modules/auth/mfa.guard';
import { AuthMiddleware } from './modules/auth/auth.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/auth.guard';
import { RolesGuard } from './modules/auth/roles.guard';
import { PermissoesGuard } from './modules/auth/permissoes.guard';
import { PrismaModule } from './modules/prisma/prisma.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { BolaoModule } from './modules/bolao/bolao.module';
import { ParticipanteModule } from './modules/participante/participante.module';
import { SorteioModule } from './modules/sorteio/sorteio.module';
import { PremioModule } from './modules/premio/premio.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { GoogleDriveModule } from './modules/google-drive/google-drive.module';
import { RelatorioModule } from './modules/relatorio/relatorio.module';
import { PwaModule } from './modules/pwa/pwa.module';
import { PermissaoModule } from './modules/permissao/permissao.module';
import { PerfilModule } from './modules/perfil/perfil.module';
import { UsuarioModule } from './modules/usuario/usuario.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { PortalModule } from './modules/portal/portal.module';
import { CrmModule } from './modules/crm/crm.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1_000,  limit: 10  }, // 10 req/s por IP
      { name: 'medium', ttl: 60_000, limit: 100 }, // 100 req/min por IP
    ]),
    SupabaseModule,
    PrismaModule,
    AuthModule,
    TenantModule,
    BolaoModule,
    ParticipanteModule,
    SorteioModule,
    PremioModule,
    WhatsAppModule,
    GoogleDriveModule,
    RelatorioModule,
    PwaModule,
    // RBAC enterprise — perfis dinâmicos, permissões granulares, auditoria
    PermissaoModule,
    PerfilModule,
    UsuarioModule,
    AuditoriaModule,
    PortalModule,
    CrmModule,
  ],
  providers: [
    // Ordem: throttle → autenticação → 2FA → role → permissões
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MfaGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissoesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
