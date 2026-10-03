import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to the limit per window, then resets', () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    const rule = { key: 'k', limit: 2, windowMs: 1000 };
    expect(limiter.tryConsume([rule])).toBe(true);
    expect(limiter.tryConsume([rule])).toBe(true);
    expect(limiter.tryConsume([rule])).toBe(false);
    now = 1000;
    expect(limiter.tryConsume([rule])).toBe(true);
  });

  it('consumes nothing when any rule is exhausted', () => {
    const limiter = new RateLimiter(() => 0);
    const tight = { key: 'tight', limit: 1, windowMs: 1000 };
    const loose = { key: 'loose', limit: 10, windowMs: 1000 };
    expect(limiter.tryConsume([tight, loose])).toBe(true);
    for (let i = 0; i < 5; i++) expect(limiter.tryConsume([tight, loose])).toBe(false);
    // "loose" was only counted once: 9 more are allowed.
    for (let i = 0; i < 9; i++) expect(limiter.tryConsume([loose])).toBe(true);
    expect(limiter.tryConsume([loose])).toBe(false);
  });

  it('pruning for a short-window rule keeps the counters of longer windows', () => {
    let now = 0;
    const limiter = new RateLimiter(() => now, 3);
    const hourly = { key: 'otp-ip:1', limit: 1, windowMs: 3_600_000 };
    expect(limiter.tryConsume([hourly])).toBe(true);
    expect(limiter.tryConsume([{ key: 'search:a', limit: 60, windowMs: 60_000 }])).toBe(true);
    expect(limiter.tryConsume([{ key: 'search:b', limit: 60, windowMs: 60_000 }])).toBe(true);
    now = 120_000; // the search windows expired, the hourly one did not
    expect(limiter.tryConsume([{ key: 'search:c', limit: 60, windowMs: 60_000 }])).toBe(true);
    expect(limiter.tryConsume([hourly])).toBe(false);
  });

  it('fails closed for new keys when full of live counters', () => {
    const limiter = new RateLimiter(() => 0, 2);
    expect(limiter.tryConsume([{ key: 'a', limit: 5, windowMs: 1000 }])).toBe(true);
    expect(limiter.tryConsume([{ key: 'b', limit: 5, windowMs: 1000 }])).toBe(true);
    expect(limiter.tryConsume([{ key: 'c', limit: 5, windowMs: 1000 }])).toBe(false);
    // Known keys keep working.
    expect(limiter.tryConsume([{ key: 'a', limit: 5, windowMs: 1000 }])).toBe(true);
  });
});
