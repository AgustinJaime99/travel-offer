import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** The fixed code of development/test environments (env validation forbids it in production). */
export function otpCodeFor(env: { OTP_FIXED_CODE?: string | undefined }): string {
  return env.OTP_FIXED_CODE ?? generateOtpCode();
}

/** Bound to its challenge: a code is useless for any other challenge, and a 6-digit HMAC is not reversible without the secret. */
export function hashOtpCode(secret: string, challengeId: string, code: string): string {
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

export function otpCodeMatches(
  secret: string,
  challengeId: string,
  code: string,
  codeHash: string,
): boolean {
  const expected = Buffer.from(codeHash, 'hex');
  const actual = Buffer.from(hashOtpCode(secret, challengeId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
