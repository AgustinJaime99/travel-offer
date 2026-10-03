import { describe, expect, it } from 'vitest';
import {
  createSchoolRequestSchema,
  cueSchema,
  schoolListQuerySchema,
  updateSchoolRequestSchema,
} from './school.js';

describe('cueSchema', () => {
  it.each([
    ['0601234', '0601234'],
    ['06-01234-00', '060123400'],
    ['06.01234 00', '060123400'],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(cueSchema.parse(input)).toBe(expected);
  });

  it.each(['123', '12345678', 'ABC1234', '0601234000'])('rejects %s', (input) => {
    expect(cueSchema.safeParse(input).success).toBe(false);
  });
});

describe('createSchoolRequestSchema', () => {
  it('collapses whitespace and maps empty optional fields to null', () => {
    expect(
      createSchoolRequestSchema.parse({
        name: '  Colegio   San Martín ',
        province: 'CORDOBA',
        city: ' Villa  María ',
        address: '  ',
        cue: '',
      }),
    ).toEqual({
      name: 'Colegio San Martín',
      province: 'CORDOBA',
      city: 'Villa María',
      address: null,
      cue: null,
    });
  });

  it('rejects unknown provinces and names without letters or digits', () => {
    expect(
      createSchoolRequestSchema.safeParse({ name: 'Colegio', province: 'ATLANTIS', city: 'X Y' })
        .success,
    ).toBe(false);
    expect(
      createSchoolRequestSchema.safeParse({ name: '¡¡!!', province: 'SALTA', city: 'Salta' })
        .success,
    ).toBe(false);
  });
});

describe('updateSchoolRequestSchema', () => {
  it('distinguishes "clear" (null) from "unchanged" (absent)', () => {
    expect(updateSchoolRequestSchema.parse({ address: '' })).toEqual({ address: null });
    expect(updateSchoolRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('schoolListQuerySchema', () => {
  it('defaults to active schools and ignores empty filters', () => {
    expect(schoolListQuerySchema.parse({ q: ' ', province: '', city: '' })).toEqual({
      page: 1,
      pageSize: 20,
      status: 'active',
    });
  });
});
