/**
 * Search/comparison form of free text: lowercase, no diacritics, only [a-z0-9] words separated by
 * single spaces ("Colegio N° 5 San Martín" → "colegio n 5 san martin"). Never contains SQL LIKE wildcards.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Display form: trimmed, internal whitespace collapsed. */
export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
