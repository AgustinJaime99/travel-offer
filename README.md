# T Company Commercial Platform

MVP for Travel Rock staff to manage schools, school groups, services and priced commercial proposals, and for families to find their group's published proposal through onboarding.

> **Status:** MVP complete (Phases 0–15, see the [phase tracker](docs/MVP_PLAN.md)); **not production-ready** — legal, privacy and deployment decisions are open (see [production blockers](docs/DOMAIN.md#production-blockers-not-mvp-blockers)). Design and scope: [MVP plan](docs/MVP_PLAN.md), [architecture](docs/ARCHITECTURE.md), [domain model](docs/DOMAIN.md).

What it does: staff (`/admin`) create schools, their groups (each with an access code), a catalog of services and versioned, server-priced proposals (French system, TNA/TEA/CFT, minimum installment $ 100.000,00) and publish them. Families (`/onboarding`) verify their email with a one-time code, register interest for a student in a group and, with the group's access code, see the published proposal under **Mis viajes**. Families who cannot find their school or group report it; staff triage those reports under **Solicitudes**. Registering interest is never a reservation, contract or payment.

## Stack

| Package | Path | Tech |
|---|---|---|
| `@travel-rock/web` | `apps/web` | Next.js 16 (App Router), React 19, Tailwind CSS 4, Playwright |
| `@travel-rock/api` | `apps/api` | NestJS 12 (ESM), Prisma 7 with the `pg` driver adapter, Vitest |
| `@travel-rock/shared` | `packages/shared` | Zod transport schemas shared by web and API (never imports Prisma) |

Infrastructure (Docker Compose): PostgreSQL 17 for development, a separate PostgreSQL 17 for tests (in-memory, wiped on restart), and Mailpit as a local SMTP catcher. All ports are bound to `127.0.0.1` only (not reachable from the local network).

## Requirements

- **Node.js ≥ 22.13** (Node 24 LTS recommended; see `.nvmrc`)
- **pnpm 10.18** (`corepack enable` picks the version from `package.json`)
- **Docker** with Compose v2

## Local ports

| Service | Port | Override |
|---|---|---|
| Web (`pnpm dev`) | 3000 | `apps/web/package.json` |
| API (`pnpm dev`) | 3001 | `API_PORT` in `apps/api/.env` |
| PostgreSQL (dev) | 5440 | `POSTGRES_DEV_PORT` + `DATABASE_URL` in `apps/api/.env` |
| PostgreSQL (test) | 5441 | `POSTGRES_TEST_PORT` + `DATABASE_URL` in `apps/api/.env.test` |
| Mailpit SMTP / web UI | 1025 / [8025](http://localhost:8025) | `MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT` |
| E2E web / API | 3100 / 3101 | `apps/web/playwright.config.ts`, `apps/api/.env.test` |

The Postgres ports avoid the default 5432/5433 on purpose, so they don't clash with other local databases.

**Other ports, or a second copy next to this one.** The Docker ports are shell environment variables read by `docker compose`; the app ports live in the `.env` files, so change both sides:

```bash
export COMPOSE_PROJECT_NAME=trcopy   # separate containers and volumes for a second copy
export POSTGRES_DEV_PORT=5450 POSTGRES_TEST_PORT=5451 MAILPIT_SMTP_PORT=1035 MAILPIT_UI_PORT=8035
pnpm infra:up
# apps/api/.env:      DATABASE_URL …:5450/…   SMTP_PORT=1035
# apps/api/.env.test: DATABASE_URL …:5451/…   SMTP_PORT=1035   MAILPIT_API_URL=http://127.0.0.1:8035/api/v1
```

Keep the same `COMPOSE_PROJECT_NAME` (and port variables) for `pnpm infra:down`. If 3000/3001 are busy: `API_PORT` in `apps/api/.env` plus `API_INTERNAL_URL` in `apps/web/.env.local`; the web port is in `apps/web/package.json` and must also be listed in `WEB_ORIGINS`.

## Getting started

```bash
corepack enable
pnpm install                                   # also generates the Prisma client
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm infra:up                                  # postgres, postgres-test, mailpit (waits until healthy)
pnpm db:migrate:deploy                         # apply migrations to the dev database
pnpm db:test:migrate                           # apply migrations to the test database (for pnpm test / E2E)
```

Then choose **one** way to start the data:

- **Demo data** (recommended to try it): `pnpm demo:seed` — see [Demo](#demo) below.
- **Empty database** (as in production): `pnpm staff:create-admin --email you@example.com --name "Your Name"` prints a one-time temporary password. Log in at <http://localhost:3000/admin/login>; you will be asked to choose your own password (12–128 characters). From there ADMINs create other staff users under **Usuarios**, and everything else (schools, groups, services, proposals) from the UI. The command refuses to run once an active ADMIN exists.

Start the apps with `pnpm dev` and open <http://localhost:3000>. The browser only talks to the web origin: Next.js rewrites `/api/*` to the API, so <http://localhost:3000/api/health> should return `{"status":"ok","database":"up"}`.

## Demo

`pnpm demo:seed` fills the **development** database (it refuses `NODE_ENV=production` and a database that already has staff, schools or services; `pnpm demo:seed --reset` empties the development database first — **all its data is deleted**). It builds everything through the real API services and prints the group access codes, which are shown only once (staff can generate new ones on the group page).

Demo staff accounts — **development only**, the passwords are public in this repository:

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@demo.travelrock.local` | `demo-admin-travelrock` |
| COMMERCIAL | `comercial@demo.travelrock.local` | `demo-comercial-travelrock` |
| VIEWER | `lectura@demo.travelrock.local` | `demo-lectura-travelrock` |

Demo data: **Colegio Demo San Martín** (Córdoba, Villa María) · group **5° A** with a published proposal (DOMAIN.md worked example: cash price $ 3.000.000, down payment $ 600.000, 18 installments of $ 173.273,76, total $ 3.718.927,69); **Escuela Demo Belgrano** (Mendoza, Godoy Cruz) · group **5° B** with an access code but no proposal; a pending request for **Instituto Demo Güemes** (Salta) from `familia.demo@example.com`. The travel year is the current year + 1.

### Mailpit (verification codes)

Families sign in with a 6-digit code sent by email. Locally every email goes to Mailpit: open <http://localhost:8025>, pick the latest message for the address you typed and copy the code. Any address works (nothing leaves the machine). Codes expire after 10 minutes; "Reenviar código" waits 60 seconds between codes.

### Three journeys to try

Use a phone-sized window (or a phone on the same machine via the browser dev tools) for the family steps and a second browser profile or a private window for staff, so both sessions coexist.

**A — Published offer.**
1. Open <http://localhost:3000/onboarding>, accept the privacy notice, type a name and any email, enter the code from Mailpit.
2. Student data → province **Córdoba** → search "san martin" → **Colegio Demo San Martín** → **5° A**.
3. On the review step type the access code printed by the seed for group A (case and dash do not matter), accept and confirm.
4. **Ver la propuesta** shows the cash price, down payment, financed amount, TNA/TEA/CFT, the installments ("17 cuotas de $ 173.273,76 y 1 de $ 173.273,77") and the total.
5. Staff: log in as COMMERCIAL, **Grupos** → 5° A → the proposal; **Crear nueva versión**, change the installments, **Publicar**; the family's page shows the new version, the old one is archived and unchanged.

**B — Offer being prepared.**
1. Same onboarding, province **Mendoza** → **Escuela Demo Belgrano** → **5° B**, with the access code printed for group B.
2. The family sees "Tu propuesta se está preparando" (no prices are revealed).
3. Staff (COMMERCIAL): 5° B → **Crear propuesta**, add the three services, set down payment, installments, TNA and "Válida hasta", **Publicar**. Reload **Mis viajes**: the offer is now available. To see the $ 100.000,00 minimum installment, set TNA 0 % and 36 installments: the preview explains the rule and the maximum (24 installments for $ 2.400.000).

**C — School not found.**
1. Onboarding, any province, search a school that does not exist → **No encuentro mi colegio** → fill name, city, course and year → **Enviar**.
2. Staff: **Solicitudes** lists it as *Pendiente* together with the seeded request for Instituto Demo Güemes, with the family's contact (ADMIN/COMMERCIAL only; VIEWER sees no contact data). Change the status and add notes; nothing is created in the catalog.

Also try: VIEWER can browse everything but not change it; without the access code a family sees "Falta el código del grupo" and nothing about the offer; the staff home page (`/admin`) counts everything and filters by travel year.

## Tests

| Command | Needs | Covers |
|---|---|---|
| `pnpm test` | test DB running and migrated (`pnpm db:test:migrate`) | Unit tests (pricing engine with property tests, shared schemas, web helpers) and API integration tests against the real test PostgreSQL |
| `pnpm test:e2e` | test DB, Mailpit, Playwright Chromium (`pnpm --filter @travel-rock/web exec playwright install chromium`, once per machine); ports 3100/3101 free | Builds, migrates the test DB, runs the feature specs (desktop + mobile) and then the business journeys A/B/C with negative cases (clean DB with only the initial ADMIN) |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm build` · `pnpm db:drift-check` | — | Static checks, production builds, schema vs. migrations |

Integration tests and E2E share and empty the test database: don't run them at the same time. Neither touches the development database.

The session cookies (`tr_staff`, `tr_public`) are `Secure`; browsers and curl send them to `http://localhost`, but some HTTP clients (e.g. Python's cookiejar) do not — use HTTPS or send the `Cookie` header yourself when scripting against the API.

## Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `pnpm dev` | Builds `shared`, then runs shared (watch), API (`tsc-watch`) and web (`next dev`) in parallel |
| `pnpm build` | Production builds of all packages |
| `pnpm typecheck` | Strict TypeScript checks in all packages |
| `pnpm lint` | ESLint (type-aware, zero warnings allowed) in all packages |
| `pnpm format` / `pnpm format:check` | Prettier write / check (Markdown docs are excluded) |
| `pnpm test` | Unit and integration tests (Vitest). **Needs the test database running and migrated** |
| `pnpm staff:create-admin --email <email> --name "<name>"` | Builds the API and creates the first ADMIN with a one-time temporary password |
| `pnpm demo:seed [--reset]` | Builds the API and loads the [demo data](#demo) into the development database (development only) |
| `pnpm test:e2e` | Builds `shared` and the API, migrates the test DB, then runs both Playwright suites one after the other: the feature specs (parallel, desktop and mobile Chromium) and the business journeys |
| `pnpm test:e2e:journeys` | Same preparation, then only the Phase 13 business journeys (`apps/web/e2e/journeys/*.journey.ts`, `playwright.journeys.config.ts`): one worker, in file order, on a test DB that starts with only the initial ADMIN |
| `pnpm infra:up` / `pnpm infra:down` | Start / stop the Docker services |
| `pnpm db:migrate` | `prisma migrate dev` on the dev database (creates and applies migrations), then `prisma generate` |
| `pnpm db:migrate:deploy` | Apply existing migrations to the dev database |
| `pnpm db:test:migrate` | Apply existing migrations to the test database |
| `pnpm db:drift-check` | Fails (exit 2) if the migrated test database differs from `schema.prisma`, e.g. Prisma would drop a hand-written object |

## Environment variables

| File | Variable | Purpose |
|---|---|---|
| `apps/api/.env` (from `.env.example`) | `NODE_ENV`, `API_PORT`, `DATABASE_URL` | API runtime; validated with Zod at startup (errors name the variable, never its value). `NODE_ENV` is **required** (`development`, `test` or `production`) |
| | `AUTH_HMAC_SECRET` | Keys the stored hashes of session tokens (≥ 32 chars). Any `dev-only…`/`test-only…` value (the versioned local secrets) is rejected when `NODE_ENV=production`; generate one with `openssl rand -base64 48`. Rotating it logs everyone out |
| | `WEB_ORIGINS` | Comma-separated browser origins allowed to send state-changing requests (CSRF Origin check) |
| | `TRUST_PROXY` | Express `trust proxy`: which hops may set `X-Forwarded-For` (default `loopback`, i.e. the Next.js server) |
| | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Transactional email for verification codes (defaults: Mailpit on `localhost:1025`). Production provider TBD |
| | `SMTP_HOST` note | Use `127.0.0.1` locally, not `localhost` (see toolchain notes) |
| | `OTP_RESEND_COOLDOWN_SECONDS` | Minimum seconds between two codes for the same email (default 60; `.env.test` uses 1 so E2E can sign in again) |
| `apps/api/.env.test` | same, plus `MAILPIT_API_URL` | Test database, E2E API port and the Mailpit API read by the tests. Local-only credentials, no secrets |
| `apps/web/.env.local` (from `.env.example`) | `API_INTERNAL_URL` | Where Next.js forwards `/api/*`. **Read at build time** |

Variables already present in the environment always take precedence over `.env` files. Never put real secrets in these files.

## Staff authentication (Phase 2)

- Server-side sessions (ADR-07): an opaque token in the `tr_staff` cookie (`HttpOnly; Secure; SameSite=Lax`), stored only as an HMAC hash. Sessions expire after 2 h idle or 12 h in total. Logout, deactivation and password resets revoke sessions immediately; role changes apply on the next request.
- Every API route requires a staff session unless it is explicitly `@Public()`; a test fails if the list of public routes changes (`apps/api/test/route-inventory.int.test.ts`). Roles are enforced with `@Roles()` in the API; the web UI only hides what a role cannot use.
- Failed logins are limited per email + IP (5), per email (20) and per IP (50) in a 15-minute window, in memory (single API instance).
- API errors always have the shape `{ statusCode, code, message, issues? }` (`apiErrorSchema` in `packages/shared`).
- **Deployment requirement:** Next.js forwards any client-supplied `X-Forwarded-For` unchanged, so in production the web server must sit behind a proxy or load balancer that overwrites that header, and `TRUST_PROXY` must match the hops. Otherwise per-IP limits can be bypassed (the per-email limit still holds).

## Database migrations

Migrations live in `apps/api/prisma/migrations` and are applied with `prisma migrate deploy`.

- **Regular change:** edit `apps/api/prisma/schema.prisma`, then `pnpm db:migrate --name <change>`.
- **Hand-written SQL** (partial unique indexes, triggers, CHECK constraints, extensions, which Prisma's schema language cannot express; see ADR-06):
  ```bash
  pnpm --filter @travel-rock/api exec prisma migrate dev --create-only --name <change>
  # edit the generated migration.sql, then:
  pnpm db:migrate
  ```
- **Prefer declaring objects in `schema.prisma` when Prisma can express them** (e.g. GIN trigram indexes with `type: Gin` and `ops: raw("gin_trgm_ops")`). Objects it cannot express (CHECK constraints, partial unique indexes, triggers) are hand-written SQL; Prisma ignores CHECKs, but an undeclared index is drift and `migrate dev` will try to drop it (it then waits for a migration name). Run `pnpm db:drift-check` after migrating.
- **Review every generated migration**, and integration tests assert that hand-written objects exist (`pg_trgm`, trigram indexes, CHECK constraints).
- **Never edit a migration after it has been applied** (even a comment): its checksum changes and `migrate dev` demands a database reset. Add a new migration instead.
- Prisma 7 no longer runs `generate` after `migrate dev`; `pnpm db:migrate` does both.
- The Prisma client is generated into `apps/api/src/generated/prisma` (git-ignored). Regenerate with `pnpm --filter @travel-rock/api prisma:generate`.

## Project layout

```text
apps/
  api/            NestJS API: src/{config,common,prisma,health,mail,maintenance,staff-auth,staff-users,schools,school-groups,services,pricing,proposals,public-identity,public-catalog,enrollments,school-requests,dashboard,demo,cli}, test/ (integration), prisma/, scripts/
  web/            Next.js app: src/app/(public)/{onboarding,ingresar,mis-viajes,privacidad}, src/app/admin/{login,change-password,(panel)/…}, src/proxy.ts, e2e/ (Playwright)
packages/
  shared/         Zod schemas and types used by both apps
docs/             MVP plan, architecture, domain model
docker-compose.yml
eslint.base.mjs   Shared ESLint config extended by each package
tsconfig.base.json
```

## Known toolchain notes

- `pnpm-workspace.yaml` overrides `mysql2` and `deepmerge-ts` (transitive dependencies of the Prisma CLI, unused with PostgreSQL) to patched versions so `pnpm audit` is clean (Phase 14); remove the overrides once Prisma ships them.
- Env files: `.gitignore` ignores every `.env*` except `.env.example` files and `apps/api/.env.test` (local-only values).
- The API purges expired OTP challenges (one day after expiry) and expired sessions hourly (`apps/api/src/maintenance/`).
- **NestJS CLI is not used.** Its dependency `@angular-devkit/schematics` requires Node ≥ 22.22.3 / 24.15 and crashes on older 22.x. The API is built with `tsc` and runs with `tsc-watch` in development.
- **Pinned versions:** `prisma` is pinned to 7.10.0 because the npm `latest` tag currently points to an 8.0 release candidate. TypeScript is pinned to 6.0 (typescript-eslint does not support 7 yet), and ESLint to 9 (React/import/a11y plugins in `eslint-config-next` do not support ESLint 10 yet).
- Vitest uses SWC (`unplugin-swc`) so NestJS decorator metadata is emitted in tests.
- The pricing engine (`apps/api/src/pricing/domain`) is pure `bigint` code with no imports (enforced by a test). Its property test uses a fixed seed; explore other inputs with `PRICING_SEED=<n> pnpm --filter @travel-rock/api exec vitest run src/pricing`.
- API integration tests and E2E use the same test database and empty it; don't run them at the same time.
- E2E global setup runs after Playwright has started the web servers: it empties the test DB, creates the first ADMIN with the real CLI and activates test COMMERCIAL/VIEWER accounts through the API (`apps/web/e2e/global-setup.ts`).
- Client forms stay disabled until React has hydrated (`useHydrated`), so text typed earlier cannot be silently discarded.
- Mailpit runs with `MP_SMTP_DISABLE_RDNS=true`: its reverse DNS lookup of each SMTP client stalled the greeting ~5 s after idle periods, which made E2E flaky (found in Phase 10). Internal URLs (`SMTP_HOST`, `API_INTERNAL_URL`) default to `127.0.0.1` instead of `localhost` to avoid name resolution entirely.
- E2E specs run in parallel on one shared test database: they must not assume a globally empty catalog (only their own uniquely named records). Exact counts are asserted in API integration tests instead.
- The business journeys are the exception: their own config empties the test DB, creates only the initial ADMIN and runs them serially, so they can assert the empty catalog and exact dashboard counts. They use the same ports as the feature specs: never run both suites at once. `apps/api/scripts/expire-test-proposal.mjs` (refuses non-`_test` databases) simulates a publication expiring.
- E2E browsers all reach the API from the same IP (the Next.js server): per-IP limits (10 codes/hour) bound how many sign-ups one E2E run can do.
- `next dev` creates `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` (pointers to the bundled Next.js docs for AI agents).
