import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './app.js';
import { uniqueEmail, uniqueIp } from './public.js';

// From .env.test (vitest env), so an overridden MAILPIT_UI_PORT works too.
const MAILPIT = process.env['MAILPIT_API_URL'] ?? 'http://127.0.0.1:8025/api/v1';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp(); // real SMTP sender → Mailpit (docker-compose)
});

afterAll(async () => {
  await app.close();
});

describe('verification email through SMTP (Mailpit)', () => {
  it('delivers the code to the inbox', async () => {
    const email = uniqueEmail('mailpit');
    await request(app.getHttpServer())
      .post('/api/public/auth/otp/request')
      .set('X-Forwarded-For', uniqueIp())
      .send({ type: 'EMAIL', value: email })
      .expect(202);

    const search = (await (
      await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    ).json()) as {
      messages: { ID: string; Subject: string }[];
    };
    expect(search.messages).toHaveLength(1);
    expect(search.messages[0]!.Subject).toBe('Tu código de verificación de Travel Rock');
    const message = (await (
      await fetch(`${MAILPIT}/message/${search.messages[0]!.ID}`)
    ).json()) as { Text: string };
    expect(message.Text).toMatch(/Tu código de verificación es \d{6}\./);
  });
});
