import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', database: 'up' })).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('rejects unknown statuses', () => {
    expect(healthResponseSchema.safeParse({ status: 'fine', database: 'up' }).success).toBe(false);
  });
});
