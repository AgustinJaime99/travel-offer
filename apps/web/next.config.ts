import type { NextConfig } from 'next';

// Rewrites are resolved at build time: set API_INTERNAL_URL before `next build`.
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

// script-src/style-src are not restricted: Next.js relies on inline scripts and styles.
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // Lets the E2E build use its own output directory, separate from `next dev`/`next build`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // Same-origin API (ADR-07): the browser only talks to the web origin.
  rewrites: () =>
    Promise.resolve([{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }]),
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
};

export default nextConfig;
