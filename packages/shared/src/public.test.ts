import { describe, expect, it } from 'vitest';
import { contactInputSchema, normalizePhone } from './contact.js';
import {
  accessCodeInputSchema,
  CONSENT_TEXT_VERSION,
  enrollmentRequestSchema,
  otpVerifyRequestSchema,
} from './public.js';

describe('contacts', () => {
  it('normalizes emails and only accepts email in the MVP', () => {
    expect(contactInputSchema.parse({ type: 'EMAIL', value: ' Ana@Mail.COM ' })).toEqual({
      type: 'EMAIL',
      value: 'ana@mail.com',
    });
    expect(contactInputSchema.safeParse({ type: 'PHONE', value: '+5491112345678' }).success).toBe(
      false,
    );
  });

  it.each([
    ['011 15 1234-5678', '+5491112345678'],
    ['+54 9 11 1234-5678', '+5491112345678'],
    ['0351 15 412-3456', '+5493514123456'],
    ['1234', null],
    ['no es un teléfono', null],
  ])('normalizePhone(%s) → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('otp verify', () => {
  it('requires a 6-digit code', () => {
    const base = { challengeId: '019a0000-0000-7000-8000-000000000001' };
    expect(otpVerifyRequestSchema.safeParse({ ...base, code: ' 123456 ' }).success).toBe(true);
    for (const code of ['12345', '1234567', 'abcdef']) {
      expect(otpVerifyRequestSchema.safeParse({ ...base, code }).success).toBe(false);
    }
  });
});

describe('enrollment request', () => {
  const valid = {
    idempotencyKey: '019a0000-0000-7000-8000-000000000001',
    schoolId: '019a0000-0000-7000-8000-000000000002',
    schoolGroupId: '019a0000-0000-7000-8000-000000000003',
    studentFirstName: ' Ana ',
    studentLastName: 'Pérez',
    relationship: 'GUARDIAN',
    consentTextVersion: CONSENT_TEXT_VERSION,
    consent: true,
  };

  it('accepts a complete request', () => {
    expect(enrollmentRequestSchema.parse(valid).studentFirstName).toBe('Ana');
  });

  it('requires explicit consent to the current text and rejects extra data', () => {
    expect(enrollmentRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(enrollmentRequestSchema.safeParse({ ...valid, consentTextVersion: 'old' }).success).toBe(
      false,
    );
    expect(enrollmentRequestSchema.safeParse({ ...valid, dni: '12345678' }).success).toBe(false);
  });
});

describe('access code input', () => {
  it('ignores case and separators', () => {
    expect(accessCodeInputSchema.parse(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(accessCodeInputSchema.parse('ABCD EFGH')).toBe('ABCDEFGH');
  });

  it.each(['ABCD-EFG', 'ABCD-EFGHI', 'ABCD-EFG0', 'ABCD-EFGI', ''])('rejects %s', (code) => {
    expect(accessCodeInputSchema.safeParse(code).success).toBe(false);
  });

  it('is optional in the enrollment request; empty means none', () => {
    const base = {
      idempotencyKey: '019a0000-0000-7000-8000-000000000001',
      schoolId: '019a0000-0000-7000-8000-000000000002',
      schoolGroupId: '019a0000-0000-7000-8000-000000000003',
      studentFirstName: 'Ana',
      studentLastName: 'Pérez',
      relationship: 'GUARDIAN',
      consentTextVersion: CONSENT_TEXT_VERSION,
      consent: true,
    };
    expect(
      enrollmentRequestSchema.parse({ ...base, accessCode: ' - ' }).accessCode,
    ).toBeUndefined();
    expect(enrollmentRequestSchema.parse({ ...base, accessCode: 'abcd-efgh' }).accessCode).toBe(
      'ABCDEFGH',
    );
    expect(enrollmentRequestSchema.safeParse({ ...base, accessCode: 'nope' }).success).toBe(false);
  });
});
