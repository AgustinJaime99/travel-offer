import { defineConfig, devices } from '@playwright/test';
import { apiTestEnv } from './e2e/test-env';

// E2E runs against the test database, on ports that do not clash with `pnpm dev`.
// `pnpm test:e2e` (repository root) builds shared and the API and migrates the test DB first.
const apiPort = apiTestEnv['API_PORT'] ?? '3101';
const webPort = '3100';
const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      env: apiTestEnv,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${webPort}`,
      // The onboarding journey runs with the post-MVP 3D backdrop on, proving it never blocks the flow.
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
        NEXT_PUBLIC_ONBOARDING_3D: '1',
      },
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
