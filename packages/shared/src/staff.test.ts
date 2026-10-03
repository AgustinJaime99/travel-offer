import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  createStaffUserRequestSchema,
  loginRequestSchema,
  updateStaffUserRequestSchema,
} from './staff.js';

describe('staff schemas', () => {
  it('normalizes emails to trimmed lowercase', () => {
    expect(loginRequestSchema.parse({ email: '  Ana@TravelRock.COM ', password: 'x' }).email).toBe(
      'ana@travelrock.com',
    );
  });

  it('rejects invalid emails', () => {
    expect(loginRequestSchema.safeParse({ email: 'no-es-un-email', password: 'x' }).success).toBe(
      false,
    );
  });

  it('enforces new password length 12..128 without composition rules', () => {
    const parse = (newPassword: string) =>
      changePasswordRequestSchema.safeParse({ currentPassword: 'old-password', newPassword });
    expect(parse('a'.repeat(11)).success).toBe(false);
    expect(parse('frase larga sin numeros').success).toBe(true);
    expect(parse('a'.repeat(128)).success).toBe(true);
    expect(parse('a'.repeat(129)).success).toBe(false);
  });

  it('rejects reusing the current password', () => {
    const result = changePasswordRequestSchema.safeParse({
      currentPassword: 'misma contraseña larga',
      newPassword: 'misma contraseña larga',
    });
    expect(result.success).toBe(false);
  });

  it('only accepts known roles', () => {
    const base = { email: 'a@b.com', fullName: 'Ana Pérez' };
    expect(createStaffUserRequestSchema.safeParse({ ...base, role: 'COMMERCIAL' }).success).toBe(
      true,
    );
    expect(createStaffUserRequestSchema.safeParse({ ...base, role: 'ROOT' }).success).toBe(false);
  });

  it('requires at least one field to update', () => {
    expect(updateStaffUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateStaffUserRequestSchema.safeParse({ active: false }).success).toBe(true);
  });
});
