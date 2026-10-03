import { randomInt } from 'node:crypto';
import { ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH, normalizeAccessCode } from '@travel-rock/shared';
import { hashPassword } from '../staff-auth/password.js';

/** 8 characters from a 31-symbol alphabet (~40 bits); verification attempts will be rate-limited (Phase 10). */
export function generateAccessCode(): string {
  return Array.from(
    { length: ACCESS_CODE_LENGTH },
    () => ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)],
  ).join('');
}

/** Same argon2id parameters as passwords, over the canonical form of the code. */
export function hashAccessCode(code: string): Promise<string> {
  return hashPassword(normalizeAccessCode(code));
}
