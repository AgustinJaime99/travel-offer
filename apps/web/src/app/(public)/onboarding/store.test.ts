import { describe, expect, it } from 'vitest';
import { firstIncompleteStep, isStepReachable, newIdempotencyKey } from './store';

const base = {
  idempotencyKey: 'k',
  privacyAccepted: false,
  fullName: '',
  email: '',
  challengeId: null,
  signedIn: false,
  student: null,
  location: null,
  school: null,
  group: null,
  submitted: null,
};
const school = { id: 's', name: 'Colegio', city: 'Salta', province: 'SALTA' as const };

describe('onboarding step guard', () => {
  it('walks the steps in order', () => {
    expect(firstIncompleteStep(base)).toBe('bienvenida');
    expect(firstIncompleteStep({ ...base, privacyAccepted: true })).toBe('contacto');
    expect(firstIncompleteStep({ ...base, privacyAccepted: true, challengeId: 'c' })).toBe(
      'codigo',
    );
    const signedIn = { ...base, privacyAccepted: true, signedIn: true };
    expect(firstIncompleteStep(signedIn)).toBe('alumno');
    const full = {
      ...signedIn,
      student: { firstName: 'A', lastName: 'B', relationship: 'GUARDIAN' as const },
      location: { province: 'SALTA' as const, city: '' },
      school,
      group: { id: 'g', name: '5° A', travelYear: 2027 },
    };
    expect(firstIncompleteStep(full)).toBe('confirmar');
  });

  it('never allows skipping ahead, and skips contact steps once signed in', () => {
    expect(isStepReachable('colegio', { ...base, privacyAccepted: true })).toBe(false);
    expect(isStepReachable('bienvenida', { ...base, privacyAccepted: true })).toBe(true);
    const signedIn = { ...base, privacyAccepted: true, signedIn: true };
    expect(isStepReachable('contacto', signedIn)).toBe(false);
    expect(isStepReachable('codigo', signedIn)).toBe(false);
    expect(isStepReachable('alumno', signedIn)).toBe(true);
    expect(isStepReachable('listo', signedIn)).toBe(false);
  });
});

describe('idempotency key', () => {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('is a UUID v4 even where crypto.randomUUID is unavailable (non-secure origins)', () => {
    expect(newIdempotencyKey()).toMatch(uuidV4);
    const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newIdempotencyKey()).toMatch(uuidV4);
    } finally {
      if (original) Object.defineProperty(crypto, 'randomUUID', original);
      else delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
