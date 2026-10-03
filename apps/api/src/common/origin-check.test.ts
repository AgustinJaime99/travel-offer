import { describe, expect, it } from 'vitest';
import { isStateChangeAllowed } from './origin-check.js';

const allowed = ['http://localhost:3000'];

describe('isStateChangeAllowed', () => {
  it('always allows safe methods', () => {
    expect(isStateChangeAllowed('GET', { origin: 'https://evil.example' }, allowed)).toBe(true);
  });

  it('allows state changes from an allowed origin', () => {
    expect(isStateChangeAllowed('POST', { origin: 'http://localhost:3000' }, allowed)).toBe(true);
  });

  it('rejects state changes from other origins, including "null"', () => {
    expect(isStateChangeAllowed('POST', { origin: 'https://evil.example' }, allowed)).toBe(false);
    expect(isStateChangeAllowed('PATCH', { origin: 'null' }, allowed)).toBe(false);
  });

  it('uses Fetch Metadata when Origin is missing', () => {
    expect(isStateChangeAllowed('POST', { 'sec-fetch-site': 'same-origin' }, allowed)).toBe(true);
    expect(isStateChangeAllowed('POST', { 'sec-fetch-site': 'cross-site' }, allowed)).toBe(false);
    expect(isStateChangeAllowed('DELETE', { 'sec-fetch-site': 'same-site' }, allowed)).toBe(false);
  });

  it('allows non-browser clients that send neither header', () => {
    expect(isStateChangeAllowed('POST', {}, allowed)).toBe(true);
  });
});
