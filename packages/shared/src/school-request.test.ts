import { describe, expect, it } from 'vitest';
import { schoolRequestSchema, updateRequestReviewSchema } from './school-request.js';
import { travelYearRange } from './school-group.js';

const YEAR = travelYearRange().min + 2;

describe('schoolRequestSchema', () => {
  it('accepts a missing school with its place, course and year', () => {
    expect(
      schoolRequestSchema.parse({
        type: 'SCHOOL_NOT_FOUND',
        schoolName: ' Colegio  Nuevo ',
        province: 'SALTA',
        city: 'Salta',
        course: '5° A',
        travelYear: YEAR,
      }),
    ).toMatchObject({ schoolName: 'Colegio Nuevo' });
  });

  it('requires an existing school for a missing group and no school fields', () => {
    const base = { type: 'GROUP_NOT_FOUND', course: '5° B', travelYear: YEAR };
    expect(
      schoolRequestSchema.safeParse({ ...base, schoolId: '019a0000-0000-7000-8000-000000000001' })
        .success,
    ).toBe(true);
    expect(schoolRequestSchema.safeParse(base).success).toBe(false);
    expect(
      schoolRequestSchema.safeParse({
        ...base,
        schoolId: '019a0000-0000-7000-8000-000000000001',
        schoolName: 'X',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown types and empty courses', () => {
    expect(schoolRequestSchema.safeParse({ type: 'OTHER' }).success).toBe(false);
    expect(
      schoolRequestSchema.safeParse({
        type: 'SCHOOL_NOT_FOUND',
        schoolName: 'Colegio',
        province: 'SALTA',
        city: 'Salta',
        course: ' ',
        travelYear: YEAR,
      }).success,
    ).toBe(false);
  });
});

describe('updateRequestReviewSchema', () => {
  it('needs a change and maps empty notes to null', () => {
    expect(updateRequestReviewSchema.safeParse({}).success).toBe(false);
    expect(updateRequestReviewSchema.parse({ staffNotes: ' ' })).toEqual({ staffNotes: null });
  });
});
