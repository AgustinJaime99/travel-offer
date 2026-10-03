import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('produces argon2id hashes with the configured cost', async () => {
    const passwordHash = await hashPassword('una frase de prueba larga');
    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('verifies the right password and rejects others', async () => {
    const passwordHash = await hashPassword('una frase de prueba larga');
    expect(await verifyPassword(passwordHash, 'una frase de prueba larga')).toBe(true);
    expect(await verifyPassword(passwordHash, 'otra frase de prueba larga')).toBe(false);
  });

  it('treats malformed hashes as a failed verification', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('generates readable 16-character passwords in groups of four', () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){3}$/);
  });

  it('does not repeat', () => {
    const passwords = new Set(Array.from({ length: 200 }, generateTemporaryPassword));
    expect(passwords.size).toBe(200);
  });
});
