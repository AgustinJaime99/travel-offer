import { minorToArsInput, parseArsToMinor } from '@travel-rock/shared';
import type { ChangeEvent, FocusEvent } from 'react';

/**
 * Canonical Argentine format of a typed amount: "10000" → "10.000,00", "1250000,5" → "1.250.000,50".
 * Invalid or empty input is returned unchanged, so the form's validation message stays meaningful.
 */
export function normalizeArsInput(value: string): string {
  const minor = parseArsToMinor(value);
  return minor === null ? value : minorToArsInput(minor);
}

/**
 * Blur handler that rewrites the field in canonical format and reports it through the field's own
 * `onChange` (works for react-hook-form `register` and for controlled inputs alike).
 */
export function formatArsOnBlur(handlers: {
  onChange?: ((event: ChangeEvent<HTMLInputElement>) => unknown) | undefined;
  onBlur?: ((event: FocusEvent<HTMLInputElement>) => unknown) | undefined;
}) {
  return (event: FocusEvent<HTMLInputElement>) => {
    const formatted = normalizeArsInput(event.target.value);
    if (formatted !== event.target.value) {
      event.target.value = formatted;
      void handlers.onChange?.(event);
    }
    void handlers.onBlur?.(event);
  };
}
