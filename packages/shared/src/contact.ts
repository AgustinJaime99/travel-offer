import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

export const contactTypes = ['EMAIL', 'PHONE'] as const;
export const contactTypeSchema = z.enum(contactTypes);
export type ContactType = z.infer<typeof contactTypeSchema>;

/** Trimmed and lowercased, no provider-specific rewriting (T8). */
export const contactEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Ingresá un email válido.' })
      .max(254, { error: 'El email es demasiado largo.' }),
  );

/**
 * E.164 with Argentina as default region, so "011 15 1234-5678" ≡ "+54 9 11 1234-5678" → "+5491112345678".
 * Ready for when phone verification is enabled (needs an approved SMS/WhatsApp provider).
 */
export function normalizePhone(input: string): string | null {
  const phone = parsePhoneNumberFromString(input, 'AR');
  return phone?.isValid() ? phone.number : null;
}

/** Applicant contact in the MVP: email only (F-e). */
export const contactInputSchema = z.strictObject({
  type: z.literal('EMAIL', { error: 'Por ahora solo se puede verificar un email.' }),
  value: contactEmailSchema,
});
export type ContactInput = z.output<typeof contactInputSchema>;
