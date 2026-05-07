import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Logs estruturados — em produção substituir por Pino/Winston
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService);
  const env = config.get<string>('APP_ENV', 'local');
  const port = config.get<number>('API_PORT', 3000);
  const corsOrigins = config.get<string>('CORS_ORIGINS', 'http://localhost:4200');

  // Segurança
  app.use(helmet());

  // CORS — em produção usa apenas os domínios listados em CORS_ORIGINS
  app.enableCors({
    origin: env === 'local' ? true : corsOrigins.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id', 'X-Request-Id'],
  });

  // Prefixo e versionamento
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validação global via class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // Remove campos não declarados no DTO
      forbidNonWhitelisted: true,
      transform: true,          // Converte tipos automaticamente
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger — apenas fora de produção
  if (env !== 'production') {
    const docConfig = new DocumentBuilder()
      .setTitle('NossoBolão API')
      .setDescription('API do sistema multitenant de gestão de bolões da Mega-Sena')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Tenant-Id' }, 'tenant-id')
      .build();

    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);

  console.log(`🚀 NossoBolão API rodando na porta ${port} [${env}]`);
  if (env !== 'production') {
    console.log(`📖 Swagger: http://localhost:${port}/docs`);
  }
}

bootstrap();
