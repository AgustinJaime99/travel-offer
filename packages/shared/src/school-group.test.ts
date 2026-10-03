import { describe, expect, it } from 'vitest';
import {
  createSchoolGroupRequestSchema,
  estimatedStudentsSchema,
  formatAccessCode,
  normalizeAccessCode,
  travelYearRange,
  travelYearSchema,
  updateSchoolGroupRequestSchema,
} from './school-group.js';

const SCHOOL_ID = '019a0000-0000-7000-8000-000000000001';

describe('travel year', () => {
  it('accepts last year to five years ahead', () => {
    expect(travelYearRange(new Date('2026-10-02T12:00:00'))).toEqual({ min: 2025, max: 2031 });
    const { min, max } = travelYearRange();
    expect(travelYearSchema.parse(String(min))).toBe(min);
    expect(travelYearSchema.parse(max)).toBe(max);
    expect(travelYearSchema.safeParse(min - 1).success).toBe(false);
    expect(travelYearSchema.safeParse(max + 1).success).toBe(false);
    expect(travelYearSchema.safeParse('').success).toBe(false);
  });
});

describe('estimatedStudentsSchema', () => {
  it.each([
    ['', null],
    ['35', 35],
    [40, 40],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(estimatedStudentsSchema.parse(input)).toBe(expected);
  });

  it.each(['0', '-3', '2.5', 'treinta', '2001'])('rejects %s', (input) => {
    expect(estimatedStudentsSchema.safeParse(input).success).toBe(false);
  });
});

describe('group requests', () => {
  it('normalizes the name and requires a school', () => {
    const { max } = travelYearRange();
    expect(
      createSchoolGroupRequestSchema.parse({
        schoolId: SCHOOL_ID,
        name: '  5°   A ',
        travelYear: max,
      }),
    ).toEqual({ schoolId: SCHOOL_ID, name: '5° A', travelYear: max });
    expect(
      createSchoolGroupRequestSchema.safeParse({ name: '5° A', travelYear: max }).success,
    ).toBe(false);
  });

  it('does not allow moving a group to another school', () => {
    expect(updateSchoolGroupRequestSchema.safeParse({ schoolId: SCHOOL_ID }).success).toBe(false);
    expect(updateSchoolGroupRequestSchema.safeParse({ status: 'INACTIVE' }).success).toBe(true);
  });
});

describe('access codes', () => {
  it('normalizes user input and formats for display', () => {
    expect(normalizeAccessCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(formatAccessCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});
