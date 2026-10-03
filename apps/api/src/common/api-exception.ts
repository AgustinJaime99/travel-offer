import { HttpException } from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@travel-rock/shared';

/** HTTP error with a stable machine-readable code; serialized as ApiError by ApiExceptionFilter. */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiError['issues'],
  ) {
    super(message, status);
  }
}
