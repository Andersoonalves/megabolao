import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as Record<string, unknown>;

      // BusinessException já vem formatado
      if (body['requestId']) {
        response.status(status).json(body);
        return;
      }

      // ValidationPipe (400) — formata details a partir de message[]
      const messages: string[] = Array.isArray(body['message'])
        ? (body['message'] as string[])
        : [String(body['message'] ?? exception.message)];

      response.status(status).json({
        statusCode: status,
        error: status === HttpStatus.BAD_REQUEST ? 'VALIDACAO_INVALIDA' : String(body['error'] ?? 'ERRO'),
        message: status === HttpStatus.BAD_REQUEST ? 'Dados inválidos na requisição' : messages[0],
        details: messages.map((msg) => ({ code: 'VALIDACAO_INVALIDA', message: msg })),
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.logger.error(`Erro inesperado em ${request.method} ${request.url}`, exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'ERRO_INTERNO',
      message: 'Erro interno do servidor',
      details: [],
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
    });
  }
}
