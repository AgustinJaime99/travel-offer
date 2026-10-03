import { describe, expect, it } from 'vitest';
import { updateProposalDraftRequestSchema } from './proposal.js';

const SERVICE = '019a0000-0000-7000-8000-000000000001';
const base = { items: [{ serviceId: SERVICE, quantity: 1 }], installments: 0, tnaBps: 0 };

describe('updateProposalDraftRequestSchema', () => {
  it('applies defaults', () => {
    expect(updateProposalDraftRequestSchema.parse(base)).toEqual({
      items: [{ serviceId: SERVICE, quantity: 1, discountMinor: '0' }],
      commercialDiscountMinor: '0',
      downPaymentMinor: '0',
      installments: 0,
      tnaBps: 0,
      passengerCount: null,
      validFrom: null,
      validUntil: null,
    });
  });

  it('rejects duplicated services, inverted validity and client totals', () => {
    const duplicated = updateProposalDraftRequestSchema.safeParse({
      ...base,
      items: [base.items[0], base.items[0]],
    });
    expect(duplicated.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'items.1.serviceId',
    ]);
    const inverted = updateProposalDraftRequestSchema.safeParse({
      ...base,
      validFrom: '2027-03-01T00:00:00-03:00',
      validUntil: '2027-02-01T00:00:00-03:00',
    });
    expect(inverted.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['validUntil']);
    expect(
      updateProposalDraftRequestSchema.safeParse({ ...base, totalPayableMinor: '1' }).success,
    ).toBe(false);
  });
});
