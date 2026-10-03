import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@travel-rock/shared';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { ApiException } from './api-exception.js';

const codeByStatus: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

const messageByCode: Partial<Record<ApiErrorCode, string>> = {
  VALIDATION_FAILED: 'La solicitud no es válida.',
  UNAUTHENTICATED: 'Tenés que iniciar sesión.',
  FORBIDDEN: 'No tenés permisos para esta acción.',
  NOT_FOUND: 'No encontrado.',
  RATE_LIMITED: 'Demasiados intentos. Probá de nuevo más tarde.',
};

/**
 * Safety net for database errors a service did not map itself (services map the expected ones,
 * e.g. P2002 → GROUP_TAKEN): a client-caused condition must not surface as a 500.
 */
const prismaErrors: Record<string, Pick<ApiError, 'statusCode' | 'code' | 'message'>> = {
  P2025: { statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado.' },
  P2002: {
    statusCode: 409,
    code: 'CONFLICT',
    message: 'La operación entra en conflicto con otro registro. Recargá y probá de nuevo.',
  },
  P2003: {
    statusCode: 409,
    code: 'CONFLICT',
    message: 'La operación entra en conflicto con otro registro. Recargá y probá de nuevo.',
  },
  P2034: {
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Hubo un cambio simultáneo. Probá de nuevo.',
  },
  P2000: { statusCode: 400, code: 'VALIDATION_FAILED', message: 'La solicitud no es válida.' },
  P2023: { statusCode: 400, code: 'VALIDATION_FAILED', message: 'La solicitud no es válida.' },
  P2033: { statusCode: 400, code: 'VALIDATION_FAILED', message: 'La solicitud no es válida.' },
};

/** Every error leaves the API as an ApiError; unexpected errors never expose internals. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toApiError(exception);
    response.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof ApiException) {
      const body: ApiError = {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
      if (exception.issues) body.issues = exception.issues;
      return body;
    }
    if (exception instanceof HttpException && exception.getStatus() < 500) {
      const statusCode = exception.getStatus();
      const code = codeByStatus[statusCode] ?? 'VALIDATION_FAILED';
      return { statusCode, code, message: messageByCode[code] ?? 'La solicitud no es válida.' };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = prismaErrors[exception.code];
      if (mapped) {
        this.logger.warn(`Unmapped database error ${exception.code}`);
        return { ...mapped };
      }
    }
    // Name only: messages and stacks of driver errors can contain query data.
    const name = exception instanceof Error ? exception.name : typeof exception;
    this.logger.error(`Unhandled ${name}`);
    return { statusCode: 500, code: 'INTERNAL', message: 'Ocurrió un error inesperado.' };
  }
}
