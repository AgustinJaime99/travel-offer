import { describe, expect, it } from 'vitest';
import { EXAMPLE_AUTH_HMAC_SECRET, parseEnv } from './env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5440/db',
  AUTH_HMAC_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults and coerces values', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'development',
      API_PORT: 3001,
      DATABASE_URL: valid.DATABASE_URL,
      AUTH_HMAC_SECRET: valid.AUTH_HMAC_SECRET,
      WEB_ORIGINS: ['http://localhost:3000'],
      TRUST_PROXY: 'loopback',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      MAIL_FROM: 'Travel Rock <no-reply@travelrock.local>',
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      MAIL_DISABLED: false,
    });
  });

  it('parses origin lists and numeric proxy hop counts', () => {
    const env = parseEnv({
      ...valid,
      WEB_ORIGINS: 'https://app.example.com, http://localhost:3000',
      TRUST_PROXY: '1',
    });
    expect(env.WEB_ORIGINS).toEqual(['https://app.example.com', 'http://localhost:3000']);
    expect(env.TRUST_PROXY).toBe(1);
  });

  it('rejects non-postgres URLs and reports names without values', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://user:secret@localhost/db' })).toThrow(
      /^Invalid or missing environment variables: DATABASE_URL$/,
    );
  });

  it('requires a secret of at least 32 characters', () => {
    expect(() => parseEnv({ ...valid, AUTH_HMAC_SECRET: 'short' })).toThrow(/AUTH_HMAC_SECRET/);
  });

  it('rejects the example secret in production only', () => {
    const withExample = { ...valid, AUTH_HMAC_SECRET: EXAMPLE_AUTH_HMAC_SECRET };
    expect(() => parseEnv({ ...withExample, NODE_ENV: 'production' })).toThrow(/AUTH_HMAC_SECRET/);
    expect(parseEnv(withExample).AUTH_HMAC_SECRET).toBe(EXAMPLE_AUTH_HMAC_SECRET);
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        AUTH_HMAC_SECRET: `test-only-${'x'.repeat(30)}`,
      }),
    ).toThrow(/AUTH_HMAC_SECRET/);
  });

  it('accepts a fixed 6-digit verification code outside production only', () => {
    expect(parseEnv({ ...valid, OTP_FIXED_CODE: '123456' }).OTP_FIXED_CODE).toBe('123456');
    expect(parseEnv({ ...valid, NODE_ENV: 'test', OTP_FIXED_CODE: '123456' }).OTP_FIXED_CODE).toBe(
      '123456',
    );
    expect(() => parseEnv({ ...valid, OTP_FIXED_CODE: '12345' })).toThrow(/OTP_FIXED_CODE/);
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        AUTH_HMAC_SECRET: 'p'.repeat(48),
        OTP_FIXED_CODE: '123456',
      }),
    ).toThrow(/^Invalid or missing environment variables: OTP_FIXED_CODE$/);
  });

  it('allows disabling email delivery outside production with a fixed code only', () => {
    expect(
      parseEnv({ ...valid, MAIL_DISABLED: 'true', OTP_FIXED_CODE: '123456' }).MAIL_DISABLED,
    ).toBe(true);
    expect(() => parseEnv({ ...valid, MAIL_DISABLED: 'true' })).toThrow(
      /^Invalid or missing environment variables: MAIL_DISABLED$/,
    );
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        AUTH_HMAC_SECRET: 'p'.repeat(32),
        MAIL_DISABLED: 'true',
      }),
    ).toThrow(/MAIL_DISABLED/);
  });

  it('requires NODE_ENV explicitly', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: undefined })).toThrow(/NODE_ENV/);
  });

  it('requires DATABASE_URL', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'development', AUTH_HMAC_SECRET: valid.AUTH_HMAC_SECRET }),
    ).toThrow(/DATABASE_URL/);
  });
});
