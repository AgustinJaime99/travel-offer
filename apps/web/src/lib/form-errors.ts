import type { ApiErrorCode } from '@travel-rock/shared';
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { ApiRequestError, errorMessage } from './api-client';

/**
 * Maps an API error onto a form: field issues and field-specific codes become field errors.
 * Returns the message for the form-level alert, or null when the session expired (already redirecting).
 */
export function applyApiError<T extends FieldValues>(
  caught: unknown,
  options: {
    setError: UseFormSetError<T>;
    onUnauthenticated: () => void;
    fieldForCode?: Partial<Record<ApiErrorCode, FieldPath<T>>>;
  },
): string | null {
  if (caught instanceof ApiRequestError) {
    if (caught.status === 401) {
      options.onUnauthenticated();
      return null;
    }
    const field = caught.code ? options.fieldForCode?.[caught.code] : undefined;
    if (field) {
      options.setError(field, { message: caught.message });
      return null;
    }
    for (const issue of caught.body?.issues ?? []) {
      options.setError(issue.path as FieldPath<T>, { message: issue.message });
    }
  }
  return errorMessage(caught);
}
