import { describe, expect, it } from 'vitest';
import { LOGIN_FAILURE_WINDOW_MS, LoginAttemptLimiter } from './login-attempt-limiter.js';

function setup() {
  let now = 0;
  const limiter = new LoginAttemptLimiter(() => now);
  return { limiter, advance: (ms: number) => (now += ms) };
}

const ana = { email: 'ana@example.com', ip: '203.0.113.1' };

/** Starts `times` password checks that all fail. */
const fail = (limiter: LoginAttemptLimiter, context: typeof ana, times = 1) => {
  for (let i = 0; i < times; i++) expect(limiter.tryBegin(context)).toBe(true);
};

describe('LoginAttemptLimiter', () => {
  it('blocks after 5 failures for the same email and IP', () => {
    const { limiter } = setup();
    fail(limiter, ana, 5);
    expect(limiter.tryBegin(ana)).toBe(false);
    expect(limiter.tryBegin({ ...ana, ip: '203.0.113.2' })).toBe(true);
  });

  it('counts each attempt when it starts, so a concurrent burst cannot exceed the limit', () => {
    const { limiter } = setup();
    // 50 checks begin before any of them finishes: only 5 may run.
    const started = Array.from({ length: 50 }, () => limiter.tryBegin(ana));
    expect(started.filter(Boolean)).toHaveLength(5);
  });

  it('unblocks when the window expires', () => {
    const { limiter, advance } = setup();
    fail(limiter, ana, 5);
    advance(LOGIN_FAILURE_WINDOW_MS);
    expect(limiter.tryBegin(ana)).toBe(true);
  });

  it('protects an account across many IPs (spoofed X-Forwarded-For)', () => {
    const { limiter } = setup();
    for (let i = 0; i < 20; i++) fail(limiter, { ...ana, ip: `198.51.100.${i}` });
    expect(limiter.tryBegin({ ...ana, ip: '198.51.100.250' })).toBe(false);
  });

  it('limits one IP across many emails', () => {
    const { limiter } = setup();
    for (let i = 0; i < 50; i++) fail(limiter, { email: `user${i}@example.com`, ip: ana.ip });
    expect(limiter.tryBegin({ email: 'other@example.com', ip: ana.ip })).toBe(false);
  });

  it('a success clears the email+IP counter and refunds its own attempt elsewhere', () => {
    const { limiter } = setup();
    fail(limiter, ana, 4);
    expect(limiter.tryBegin(ana)).toBe(true);
    limiter.succeeded(ana);
    fail(limiter, ana, 4);
    expect(limiter.tryBegin(ana)).toBe(true);
    // email counter: 4 failures + 1 refunded success + 5 = 9, still under 20.
    expect(limiter.tryBegin({ ...ana, ip: '203.0.113.9' })).toBe(true);
  });

  it('a success never refunds more than its own attempt', () => {
    const { limiter } = setup();
    for (let i = 0; i < 19; i++) fail(limiter, { ...ana, ip: `198.51.100.${i}` });
    expect(limiter.tryBegin(ana)).toBe(true);
    limiter.succeeded(ana);
    expect(limiter.tryBegin({ ...ana, ip: '198.51.100.200' })).toBe(true);
    expect(limiter.tryBegin({ ...ana, ip: '198.51.100.201' })).toBe(false);
  });
});
