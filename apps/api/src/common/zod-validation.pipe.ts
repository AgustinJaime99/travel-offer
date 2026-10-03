import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiException } from './api-exception.js';

/** Validates and transforms a request part with a shared Zod schema. Never echoes input values. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Revisá los datos ingresados.',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
