import { z } from 'zod';

/** Development-only secret shipped in .env.example; rejected in production. */
export const EXAMPLE_AUTH_HMAC_SECRET = 'dev-only-insecure-secret-change-me-0123456789abcdef';
/** Prefixes of the versioned local secrets (.env.example, .env.test): never valid in production. */
const LOCAL_SECRET_PREFIXES = ['dev-only', 'test-only'];

const envSchema = z
  .object({
    // Required (no default): a deploy that forgets it must not silently run with development rules.
    NODE_ENV: z.enum(['development', 'test', 'production']),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // Keys session-token and OTP hashes. Rotating it invalidates every session.
    AUTH_HMAC_SECRET: z.string().min(32),
    // Browser origins allowed to send state-changing requests (comma-separated).
    WEB_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1)),
    // Express "trust proxy": which hops may set X-Forwarded-For (number of hops or address list).
    TRUST_PROXY: z
      .string()
      .default('loopback')
      .transform((value) => (/^\d+$/.test(value) ? Number(value) : value)),
    // Transactional email (OTP codes only). Development and tests use Mailpit; production provider TBD.
    // An IP, not "localhost": nodemailer resolves names through DNS (not /etc/hosts), which stalled ~5 s here.
    SMTP_HOST: z.string().min(1).default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3).default('Travel Rock <no-reply@travelrock.local>'),
    // Minimum time between two codes for the same contact. Tests shorten it; keep the default otherwise.
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    // Development and test only: every emailed code is this one (e.g. 123456). Rejected in production.
    OTP_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      !LOCAL_SECRET_PREFIXES.some((prefix) => env.AUTH_HMAC_SECRET.startsWith(prefix)),
    { path: ['AUTH_HMAC_SECRET'], message: 'a local example secret is not allowed in production' },
  )
  .refine((env) => env.NODE_ENV !== 'production' || env.OTP_FIXED_CODE === undefined, {
    path: ['OTP_FIXED_CODE'],
    message: 'a fixed verification code is not allowed in production',
  });

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Report variable names only: values may contain credentials.
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  return result.data;
}
