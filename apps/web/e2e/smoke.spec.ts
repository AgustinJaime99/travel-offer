import { expect, test } from '@playwright/test';
import { healthResponseSchema } from '@travel-rock/shared';

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Travel Rock' })).toBeVisible();
});

test('API and database are reachable through the same-origin /api rewrite', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(healthResponseSchema.parse(await response.json())).toEqual({
    status: 'ok',
    database: 'up',
  });
});

test('pages and API responses carry the hardening headers', async ({ request }) => {
  const page = await request.get('/');
  expect(page.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(page.headers()).toMatchObject({
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  });
  expect(page.headers()['x-powered-by']).toBeUndefined();

  const api = await request.get('/api/health');
  expect(api.headers()['cache-control']).toContain('no-store');
  expect(api.headers()['x-content-type-options']).toBe('nosniff');
});

test('unknown pages get the Spanish not-found page', async ({ page }) => {
  const response = await page.goto('/no-existe');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
});
