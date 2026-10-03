import { describe, expect, it } from 'vitest';
import { generateOtpCode, hashOtpCode, otpCodeFor, otpCodeMatches } from './otp.js';

describe('OTP codes', () => {
  it('are 6 digits, including leading zeros', () => {
    for (let i = 0; i < 500; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('match only for the same secret, challenge and code', () => {
    const hash = hashOtpCode('secret', 'challenge-1', '012345');
    expect(otpCodeMatches('secret', 'challenge-1', '012345', hash)).toBe(true);
    expect(otpCodeMatches('secret', 'challenge-1', '012346', hash)).toBe(false);
    expect(otpCodeMatches('secret', 'challenge-2', '012345', hash)).toBe(false);
    expect(otpCodeMatches('other', 'challenge-1', '012345', hash)).toBe(false);
    expect(hash).not.toContain('012345');
  });

  it('use the fixed code only when the environment sets one', () => {
    expect(otpCodeFor({ OTP_FIXED_CODE: '123456' })).toBe('123456');
    expect(otpCodeFor({})).toMatch(/^\d{6}$/);
  });
});
