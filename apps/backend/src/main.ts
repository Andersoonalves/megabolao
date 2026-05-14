import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Erros internos do whatsapp-web.js/Puppeteer (frame detached, target closed)
// são lançados de event handlers sem .catch() → matariam o processo sem isso
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const isPuppeteerInternalError =
    msg.includes('detached Frame') ||
    msg.includes('Target closed') ||
    msg.includes('Execution context was destroyed') ||
    msg.includes('Session closed');
  if (!isPuppeteerInternalError) throw reason as Error;
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService);
  const env = config.get<string>('APP_ENV', 'local');
  const port = config.get<number>('API_PORT', 3000);
  const corsOrigins = config.get<string>('CORS_ORIGINS', 'http://localhost:4200');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc:   ["'none'"],
        objectSrc:  ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Swagger precisa disto desligado
    hsts: env === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  }));

  app.enableCors({
    origin: env === 'local' ? true : corsOrigins.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id', 'X-Request-Id'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

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

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);

  console.log(`NossoBolão API porta ${port} [${env}]`);
  if (env !== 'production') {
    console.log(`Swagger: http://localhost:${port}/docs`);
  }
}

bootstrap();
