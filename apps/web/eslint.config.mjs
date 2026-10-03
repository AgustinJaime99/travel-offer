import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';
import { baseConfig } from '../../eslint.base.mjs';

export default defineConfig(
  globalIgnores([
    '.next/',
    '.next-e2e/',
    'out/',
    'next-env.d.ts',
    'playwright-report/',
    'test-results/',
  ]),
  nextVitals,
  baseConfig(import.meta.dirname),
);
