import { describe, expect, it } from 'vitest';
import { collapseWhitespace, normalizeText } from './text.js';

describe('normalizeText', () => {
  it.each([
    ['San Martín', 'san martin'],
    ['  COLEGIO   Nº 5 ', 'colegio n 5'],
    ['Peñalolén', 'penalolen'],
    ['Instituto "Güemes" (Anexo)', 'instituto guemes anexo'],
    ['100% _ test', '100 test'],
    ['!!!', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});

describe('collapseWhitespace', () => {
  it('trims and collapses internal whitespace', () => {
    expect(collapseWhitespace('  Colegio \t San   Martín ')).toBe('Colegio San Martín');
  });
});
