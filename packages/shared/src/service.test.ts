import { describe, expect, it } from 'vitest';
import {
  createServiceRequestSchema,
  serviceListQuerySchema,
  updateServiceRequestSchema,
} from './service.js';

describe('service requests', () => {
  it('normalizes text and maps an empty description to null', () => {
    expect(
      createServiceRequestSchema.parse({
        name: '  Bus   semicama ',
        description: '   ',
        category: 'TRANSPORT',
        basePriceMinor: '45000000',
      }),
    ).toEqual({
      name: 'Bus semicama',
      description: null,
      category: 'TRANSPORT',
      pricingUnit: 'PER_PASSENGER',
      basePriceMinor: '45000000',
    });
  });

  it('requires a known category and a centavo string price', () => {
    const base = { name: 'Bus', category: 'TRANSPORT', basePriceMinor: '100' };
    expect(createServiceRequestSchema.safeParse({ ...base, category: 'SPA' }).success).toBe(false);
    expect(createServiceRequestSchema.safeParse({ ...base, basePriceMinor: 100 }).success).toBe(
      false,
    );
    expect(
      createServiceRequestSchema.safeParse({ ...base, basePriceMinor: '1.000,00' }).success,
    ).toBe(false);
  });

  it('does not allow changing the pricing unit', () => {
    expect(updateServiceRequestSchema.safeParse({ pricingUnit: 'PER_GROUP' }).success).toBe(false);
    expect(updateServiceRequestSchema.safeParse({}).success).toBe(false);
  });

  it('list query defaults to active services', () => {
    expect(serviceListQuerySchema.parse({ q: '', category: '' })).toEqual({
      page: 1,
      pageSize: 20,
      status: 'active',
    });
  });
});
