import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Phase 13 business journeys (MVP_PLAN.md): one worker, in file order, on a test database that
// starts with only the initial ADMIN. Same servers and ports as the main E2E suite; run them one
// after the other (`pnpm test:e2e` at the repository root runs both).
export default defineConfig({
  ...base,
  testDir: './e2e/journeys',
  testMatch: '*.journey.ts',
  globalSetup: './e2e/journeys/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  projects: [{ name: 'journeys', use: { ...devices['Desktop Chrome'] } }],
});
