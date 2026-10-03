import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Argon2id (the library default) with OWASP minimum parameters: 19 MiB, 2 iterations, 1 lane.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Hash verified when the email is unknown, so response time does not reveal which accounts exist. */
let dummyHash: Promise<string> | undefined;
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(generateTemporaryPassword());
  return dummyHash;
}

// No look-alike characters (0/O, 1/I/l), so it can be read aloud or copied by hand.
const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 16 random characters (~92 bits) in groups of four: e.g. "Kp7w-XmQ2-..." */
export function generateTemporaryPassword(): string {
  const characters = Array.from(
    { length: 16 },
    () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)],
  ).join('');
  return characters.match(/.{4}/g)!.join('-');
}
