import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface ErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export class BusinessException extends HttpException {
  constructor(error: string, message: string, details: ErrorDetail[] = []) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error,
        message,
        details,
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
