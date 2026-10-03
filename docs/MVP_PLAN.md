# Travel Rock Commercial Platform — MVP execution plan

> Status: **Phases 0–6 approved 2026-10-02 (minimum installment set by the owner on 2026-10-02: $ 100.000,00). Phase 7 approved 2026-10-02. Phase 8 approved 2026-10-02. Phase 9 approved 2026-10-02. Phase 10 approved 2026-10-02. Phase 11 approved 2026-10-02. Phase 12 approved 2026-10-02. Phase 13 approved 2026-10-02. Phase 14 approved 2026-10-02; not production-ready (see DOMAIN.md → Production blockers). Phase 15 implemented and verified 2026-10-02, awaiting owner review.** No implementation phase is complete. Claude must obtain approval at the end of each phase. See `CLAUDE.md` for operating rules, `ARCHITECTURE.md` for design, and `DOMAIN.md` for invariants.

## Product objective

Deliver two linked experiences: (1) staff create and publish a configurable commercial travel offer for a specific `SchoolGroup` belonging to a `School`; (2) a responsible adult (guardian or adult student) verifies their contact, completes onboarding and, with the group access code, sees that offer. If the group exists without an eligible published offer, show a preparation message. If the school or group cannot be found, capture a triage request. **Schools, groups and services must be creatable from an empty commercial database using the UI.**

## MVP scope

- Staff login, roles ADMIN / COMMERCIAL / VIEWER; staff user management by ADMIN.
- School CRUD/search (name, city, province); school detail with associated groups.
- SchoolGroup CRUD/search/filter, created within a school or via global selector; group access codes.
- Service catalog CRUD; service snapshots in proposal items.
- Pure deterministic pricing engine (`french-tna12-v1`): per-passenger services, line discount, commercial discount, down payment, French amortization with TNA (max 66 %), 1–36 installments, TEA/CFT, cent-accurate schedule.
- Proposal draft, immutable versioning, atomic publication, single current published version per group.
- Admin Proposal Builder with server-calculated preview.
- Public identity: passwordless **email OTP verification** (approved scope change 2026-10-02); phone modeled for later.
- Public multi-step onboarding, school/group matching, access-code-gated offer view, school/group-not-found requests.
- Admin request queue, dashboard counts, validation, security and automated tests.

## Explicitly out of scope

Python, FastAPI, AI/RAG, recommendation scoring, Redis, Kafka, microservices, Three.js implementation, payments, contracts, legal adhesions, **notifications other than transactional email OTP codes** (no marketing/status emails, no SMS/WhatsApp in MVP), external CRM, advanced analytics, multi-currency, multiple competing payment plans per proposal, indexed installments, installment due dates, CAPTCHA, family-selectable optional extras, per-group pricing units. Keep extension seams simple; do not create empty services for these features.

## Phase tracker

| Phase | Name | Status | Acceptance gate |
|---|---|---|---|
| 0 | Architecture and business decisions | DONE — approved by owner 2026-10-02 | Owner approves ERD, access policy, money formula, proposal lifecycle |
| 1 | Monorepo bootstrap | DONE — gate verified and approved by owner 2026-10-02 | Web/API/DB/Mailpit boot; migrations, scripts and Playwright smoke test work |
| 2 | Staff authentication/RBAC | DONE — gate verified and approved by owner 2026-10-02 | Staff login, user management, protected API, role tests |
| 3 | School management | DONE — gate verified and approved by owner 2026-10-02 | Create/edit/search school from empty catalog |
| 4 | SchoolGroup management | DONE — gate verified and approved by owner 2026-10-02 | Create group under school or globally; FK, duplicate handling, access codes |
| 5 | Service catalog | DONE — gate verified and approved by owner 2026-10-02 | Create/edit/deactivate services from UI |
| 6 | Pricing engine | DONE — approved by owner 2026-10-02; minimum installment $ 100.000,00 set by owner 2026-10-02 (F-g) | Pure calculation, endpoint, reference vectors and property tests pass |
| 7 | Proposal lifecycle API | DONE — gate verified and approved by owner 2026-10-02 | Draft, version, publish, snapshots, transaction and concurrency tests |
| 8 | Admin Proposal Builder | DONE — gate verified and approved by owner 2026-10-02 | Staff can configure, preview, save and publish |
| 9 | Public identity and onboarding | DONE — gate verified and approved by owner 2026-10-02 | Email OTP sign-in/up; validated mobile-friendly multi-step flow persists interest |
| 10 | Proposal matching/view | DONE — gate verified and approved by owner 2026-10-02 | AVAILABLE/PREPARING/CODE_REQUIRED and authorized access tested |
| 11 | School/group-not-found requests | DONE — gate verified and approved by owner 2026-10-02 | Request submitted, deduplicated and visible to staff |
| 12 | Dashboard | DONE — gate verified and approved by owner 2026-10-02 | Correct summary counts with authorization |
| 13 | E2E business journeys | DONE — gate verified and approved by owner 2026-10-02 | Three core journeys pass on clean DB |
| 14 | Security and production hardening | DONE — gate verified and approved by owner 2026-10-02 (production readiness NOT claimed; see DOMAIN.md → Production blockers) | All gates pass, privacy/security review completed |
| 15 | Demo and handoff | IN PROGRESS — gate verified 2026-10-02, awaiting owner review | Reproducible seed/demo and complete README |

Update statuses to `IN PROGRESS`, `DONE` or `BLOCKED` only based on actual evidence; document blockers and approval dates.

## Detailed phase specifications

### Phase 0 — Architecture and business decisions

**Deliverables:** ERD and entity invariants (`DOMAIN.md`), Prisma schema proposal, hand-written SQL objects, module and route layout, REST contract, auth/public access approach, monetary types and exact formula with reference vectors, versioning/publishing transaction, testing strategy, privacy/consent considerations, ADRs (`ARCHITECTURE.md`), decision log (below). **No application code.**

**Approved 2026-10-02:** owner answered B1–B14, T1–T11, F-a…F-f, confirmed T6 and T11, and accepted the derived decisions (verified-only school search, access code shown once, verified applicant required for requests, sibling enrollments, staff sees enrollment counts only, proposed session durations and service categories).

### Phase 1 — Bootstrap

Create `apps/web`, `apps/api`, `packages/shared`; pnpm workspaces; Node 24 LTS; Docker Compose with PostgreSQL (dev), PostgreSQL (test) and Mailpit; Prisma migration setup (empty schema or bootstrap model only); strict TypeScript, lint/format, Vitest; Playwright with one smoke test (web loads, API `/api/health` responds, DB reachable); `.env.example`, README. No business functionality. The owner asked not to create the git repository in this phase. Gate: fresh clone can boot API/web/DB/Mailpit, run migrations and pass the smoke test with documented commands.

**Verification (2026-10-02, Node 22.14, pnpm 10.18, Docker 29.1):** from a clean state (no `node_modules`, builds, generated client, local `.env` files or DB volumes), following README commands: `pnpm install --frozen-lockfile` (generates Prisma client, no ignored build scripts), `pnpm infra:up` (dev Postgres :5440, test Postgres :5441, Mailpit :1025/:8025 healthy), `pnpm db:migrate:deploy` and `pnpm db:test:migrate` (migration `init_extensions` → `pg_trgm`), then `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 2/2, API 6/6 incl. integration against the test DB), `pnpm build` and `pnpm test:e2e` (4/4: home page + `/api/health` through the same-origin rewrite, desktop and mobile Chromium) all exit 0. `pnpm dev` verified manually (web :3000 → API :3001 via rewrite). Deviations: Node 24 not installed on the machine (engines `>=22.13`, 24 recommended); NestJS CLI dropped (requires Node ≥ 22.22.3); ESLint 9 and TypeScript 6 pinned for plugin compatibility; Postgres host ports 5440/5441 because 5432/5433 are in use. Not yet in place: CI pipeline and `prisma migrate diff` drift check (no repository yet).

### Phase 2 — Authentication and authorization

Staff identity, login/logout, server-side sessions (ADR-07), argon2id hashing, default-deny global guard with `@Public()` opt-out, role guards, same-origin rewrite and Origin check, login rate limit, CLI command to create the first ADMIN, ADMIN user management (create, role, deactivate, temporary password, forced change). Gate: ADMIN/COMMERCIAL/VIEWER permissions enforced by API and tested; deactivation revokes sessions immediately; public endpoints do not accidentally require staff login and new routes are denied by default.

**Verification (2026-10-02):** from a clean state (no `node_modules`, builds, generated client, local `.env` files or DB volumes) following the README: migrations `init_extensions`, `staff_auth`, `staff_email_normalized` applied to dev and test DBs; `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 8/8, web 11/11, API 60/60), `pnpm build` and `pnpm test:e2e` (9 passed, 1 intentionally skipped on mobile) all exit 0; API suite repeated 5× without flakes. Covered by tests: login/logout/me/change-password, cookie attributes, token stored only as HMAC, idle (2 h) and absolute (12 h) expiry, session fixation, generic credential errors, failure-based login limits (incl. spoofed `X-Forwarded-For`), Origin check, full role matrix on `/api/admin/users`, forced password change, immediate revocation on deactivation/reset, immediate role changes, self-modification and last-ADMIN rules (incl. concurrent demotion), duplicate emails, validation without echoing input, route inventory (only `GET /health` and `POST /admin/auth/login` public; every other route incl. a new undecorated one → 401), CLI bootstrap; E2E: first ADMIN via the real CLI → forced password change → create COMMERCIAL → COMMERCIAL cannot manage users → deactivation blocks login. Manually verified through the Next.js rewrite in dev: spoofed `X-Forwarded-For` is forwarded unchanged and the per-email limit still blocks (documented as a deployment requirement). Decisions taken as conventional defaults (owner informed): password length 12–128 without composition rules; server-generated temporary passwords shown once; ADMIN cannot demote/deactivate/reset themselves; last active ADMIN protected.

### Phase 3 — Schools

School create, edit, list, detail, deactivate and search by name/city/province (combinable, fuzzy via `pg_trgm`); optional unique CUE; province enum; soft duplicate warning. Routes `/admin/schools`, `/admin/schools/new`, `/admin/schools/[schoolId]`, `/admin/schools/[schoolId]/edit`. Gate: staff can create a new school without seed/SQL and see it in searchable results; duplicate-like inputs produce the warning; invalid inputs handled consistently.

**Verification (2026-10-02):** migration `schools` (Province enum, School table, CUE unique, GIN trigram indexes declared in `schema.prisma`, hand-written CHECKs for CUE format and normalized columns) applied to dev and to a freshly recreated test DB; `pnpm db:drift-check` exit 0. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 27/27, web 11/11, API 84/84), `pnpm build`, `pnpm test:e2e` (12 passed, 2 intentionally skipped on mobile; 5 consecutive green runs) all exit 0. No new dependencies. Covered: create from empty catalog and find in list; accent/case-insensitive, typo-tolerant and partial search; province/city/name combinable filters; CUE normalization, prefix search and uniqueness (409 `CUE_TAKEN`); same-named schools allowed; duplicate check (similar name+city, containment, same CUE regardless of annex, excludes self, no false positive for "Instituto San Martín" vs "Colegio San Martín"); edit with clearing optional fields and search columns kept in sync; deactivate/reactivate without delete, inactive hidden by default; 404/400 handling; role matrix (VIEWER read-only); DB rejects malformed values. E2E: COMMERCIAL with an empty catalog creates a school, finds it searching without accents, gets the duplicate warning for a similar school and saves anyway, edits and deactivates it, and inactive schools appear only with the filter; VIEWER sees no create/edit. Incidents fixed during the phase: undeclared trigram indexes were seen as drift by Prisma (now declared in the schema + `db:drift-check`); an applied migration was edited (comment) and restored to its applied content. Defaults (owner informed): CUE 7 or 9 digits, duplicates by first 7 digits; list shows active schools by default.

### Phase 4 — SchoolGroups

Required School FK, CRUD, search/filter by school/year/status, group detail, school detail embedded groups, `+ Crear grupo` with prefilled school, global create form with searchable school selector, unique `(schoolId, normalizedName, travelYear)`, access code generation/rotation (shown once). Gate: groups cannot reference missing schools; staff can create and find a group through both paths; duplicate policy, group identity and access-code hashing tested.

**Verification (2026-10-02):** migration `school_groups` (enum, table, FK `RESTRICT`, unique `(schoolId, normalizedName, travelYear)`, hand-written CHECKs added before first apply) applied to dev and test; `pnpm db:drift-check` exit 0. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 40/40, web 11/11, API 106/106), `pnpm build`, `pnpm test:e2e` (15 passed, 3 intentionally skipped on mobile; 5 consecutive green runs) all exit 0. No new dependencies. Covered: missing school rejected by API (400 on `schoolId`) and DB (FK), school with groups not deletable, inactive school blocks new groups; identity — "5° A" vs "5 a" same school/year → `409 GROUP_TAKEN`, allowed in another year/school, 3 concurrent identical creates → exactly one, rename into existing identity rejected; travel-year range, estimated students validation; list ordering and filters (school, year, text on group or school name, status), pagination; edit incl. clearing estimated students and deactivation; `schoolId` immutable (strict PATCH); access codes — format/alphabet, argon2id hash stored, plaintext/hash never returned afterwards, rotation invalidates the previous code; role matrix (VIEWER read-only). E2E: school detail "+ Crear grupo" with preselected school, access code shown once (gone after reload) and rotated, global "Nuevo grupo" with searchable school selector, duplicate rejected with field message, groups listed in the school detail and found in the global list; VIEWER cannot create. Defaults (owner informed): travel year last year to +5, validated only when set/changed; school immutable; no new groups in inactive schools.

### Phase 5 — Services

Category-aware catalog with name, description, active flag and `PER_PASSENGER` unit. Admin CRUD. Gate: staff can create services from empty DB, deactivate a service without breaking historical references, and search/select active services.

**Verification (2026-10-02):** migration `services` (enums, table, unique normalized name, GIN trigram index declared in `schema.prisma`, hand-written CHECKs for price range and normalized name added before first apply) applied to dev and test; `pnpm db:drift-check` exit 0. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 73/73, web 11/11, API 121/121), `pnpm build`, `pnpm test:e2e` (18 passed, 4 intentionally skipped on mobile; 4 consecutive green runs) all exit 0. No new dependencies. Covered: exact Argentine-format money parsing/formatting without floats (incl. round-trip and limit 10^14), centavo strings over JSON incl. values beyond the JS safe-integer range, BigInt storage; create from empty catalog; zero price allowed; invalid price/category/name rejected; duplicate names ignoring accents/case → `409 SERVICE_NAME_TAKEN`; search by text and category, ordering, pagination; inactive hidden by default; edit incl. clearing description; strict PATCH (no `pricingUnit`); deactivation keeps the service readable (proposal-item references are tested in Phase 7, when items exist); DB rejects out-of-range prices; role matrix (VIEWER read-only). E2E: COMMERCIAL with an empty catalog creates a service typing "1.250.000,5" (shown "$ 1.250.000,50 por pasajero"), gets field errors for "12.50" and a duplicate name, edits the price, deactivates it, and it only appears with the "Inactivos" filter; VIEWER cannot create. Environment note: the Playwright browser cache had been removed between sessions and was reinstalled with the documented command. Defaults (owner informed): service names unique across the catalog; zero price allowed.

### Phase 6 — Pricing engine

Pure `bigint` implementation of `french-tna12-v1` exactly as specified in `DOMAIN.md`, plus `POST /api/admin/pricing/preview`. Reject invalid discounts, negative prices, installments outside 1–36 (or ≠ 0 for cash sales), TNA outside 0–6 600 bps, amounts over limits and inconsistent units. Gate: all reference vectors pass; property tests prove `downPayment + Σ installments = totalPayable` and final balance 0; no floating point in the engine; client totals never used.

**Verification (2026-10-02):** `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 81/81, web 11/11, API 173/173), `pnpm build`, `pnpm db:drift-check`, `pnpm test:e2e` (18 passed, 4 intentionally skipped; no UI in this phase) all exit 0. No migration, no new dependencies. Pure engine `apps/api/src/pricing/domain/pricing-engine.ts` (`french-tna12-v1`, bigint only, no imports — enforced by a test). Covered: the 5 DOMAIN reference vectors and the full worked example exactly; quantities and line discounts; cash sale (rate forced to 0); every validation limit (line discount ≤ gross, commercial discount ≤ subtotal, down payment ≤ cash price, installments 0 iff cash, 1–36, TNA 0–6 600, quantity 1–999, unit `PER_PASSENGER`, amounts and totals ≤ 10^14) reported as field issues, all independent issues at once; property tests over 3 000 seeded random inputs (+15 000 with 5 extra seeds): `downPayment + Σ installments = totalPayable`, Σ principal = financed, balance ends at 0 and never negative, interest-free installments differ by ≤ 1 centavo (larger first), French installments fixed except the last within the compounded-rounding bound, first installment within 1 centavo of the floating-point annuity formula (test-only oracle), determinism. `POST /api/admin/pricing/preview`: worked example over HTTP as centavo strings, field issues, client totals and numeric/formatted amounts rejected (strict body), ADMIN/COMMERCIAL only. **Finding:** the property test found that the approved formula breaks for tiny financed amounts (3 centavos in 6 installments → negative balance); added the rule "each installment finances at least $ 1,00", verified on 10 080 504 boundary cases — **pending owner approval**. Environment: the Playwright browser cache (`~/.cache/ms-playwright`) was deleted again by something outside the project; reinstalled with the documented command.

### Phase 7 — Proposals API and versioning

Draft creation, whole-draft replace (`PUT`), item snapshots, one payment plan, clone to next version, discard/withdraw, publish transaction, partial unique indexes (one PUBLISHED, one DRAFT per group), immutability triggers, CHECK constraints. Gate: published versions cannot be edited even via direct SQL; catalog changes do not alter historical totals; concurrent publication and concurrent cloning cannot create two current offers or two drafts.

**Verification (2026-10-02):** migration `proposals` (3 tables, enum; hand-written partial unique indexes, immutability triggers and CHECKs) applied first to the test DB, drift checked (empty: Prisma 7 ignores partial indexes and triggers), then to dev. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 83/83, web 11/11, API 193/193; API suite 5 consecutive green runs), `pnpm build`, `pnpm db:drift-check`, `pnpm test:e2e` (18 passed, 4 intentionally skipped; no UI in this phase) all exit 0. No new dependencies. Covered: empty v1 draft; one draft per group (409 `DRAFT_EXISTS`); missing group; `PUT` storing the server-calculated snapshot of the DOMAIN worked example (items, schedule summary, TEA, totals, summary columns); price overrides flagged; unknown/inactive/repeated services, contract violations and client totals rejected without changing the draft; publish requires items and a future `validUntil`, freezes the snapshot with publisher and date, makes the version read-only (409 `PROPOSAL_READ_ONLY`), refused for inactive group/school; clone to v2 keeps item snapshots, publishing v2 archives v1 (exactly one PUBLISHED); withdraw and discard, version numbering continues; list by group/status; **catalog repricing, renaming and deactivation change neither the published snapshot nor cloned items**; **direct SQL** cannot update/insert/delete items or plan of a published version, change any column of it, revert it to DRAFT, alter it while archiving, delete it, or reopen an archived one; partial unique indexes reject a second PUBLISHED or DRAFT inserted by SQL; **concurrency** — 5 simultaneous publishes of a draft → exactly one, 5 simultaneous creates and 5 simultaneous clones → exactly one draft, publish racing an edit stays consistent; role matrix (VIEWER read-only). Defaults (owner informed): one line per service; publication requires active group and school; invalid drafts cannot be saved.

### Phase 8 — Proposal Builder

From group detail, create proposal; select services, quantities, line discounts, price overrides, commercial discount, down payment, installments, TNA and validity. Live server preview with breakdown (TNA/TEA/CFT, schedule, totals). Save draft, publish, create revision, withdraw. Gate: entire school → group → service → proposal → publish flow works from UI on a clean catalog.

**Verification (2026-10-02):** `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 96/96, web 13/13, API 193/193), `pnpm build`, `pnpm db:drift-check`, `pnpm test:e2e` (19 passed, 5 intentionally skipped on mobile; 4 consecutive green runs) all exit 0. No API, schema or dependency changes. **Gate E2E** (`apps/web/e2e/proposals.spec.ts`), from an empty catalog with only bootstrapped staff accounts: COMMERCIAL creates a school, a group and three services from the UI; creates the proposal from the group page; adds services with the search picker; sets commercial discount, down payment, 18 installments, TNA 35 % and validity; the live server preview shows the DOMAIN worked example exactly ($ 1.499.553,21 total, TEA 41,20 %, "17 cuotas de $ 72.197,40 y 1 de $ 72.197,41"); a price override is flagged against the catalog price and updates the preview; a line discount above the line shows the engine's field error; saves; publishes (read-only view with publisher); creates version 2, changes to 12 installments and publishes it — the group page lists v2 Publicada and v1 Archivada; a later catalog price change leaves both published totals unchanged; VIEWER sees the proposal read-only without actions. Also new: exact percent↔bps helpers and Argentine calendar-day helpers with unit tests.

### Phase 9 — Public identity and onboarding

Email OTP request/verify (neutral responses, expiry, attempts, cooldown, rate limits), applicant creation on first verification, applicant sessions, contact add/verify/remove keeping ≥ 1 verified, phone normalization utility ready for later. Mobile-first steps: welcome/privacy notice → contact → verify code → student data and relationship → location → school search → group/year (+ optional access code) → review/consent → submit. React Hook Form + Zod; Zustand persisted to `sessionStorage` for transient state. Server validates school/group association and idempotency. Gate: back/forward and refresh work; accessible validation; atomic idempotent submission; OTP emails received in Mailpit; no codes or PII in logs. Personal-data and minor/guardian handling confirmed with legal before production.

**Verification (2026-10-02):** migration `public_identity` (5 tables; hand-written partial unique index for verified contacts and CHECKs) applied first to the test DB, drift checked, then to dev (an earlier attempt applied an empty migration with only hand-written SQL to the **test** DB and failed; it was deleted and the in-memory test DB recreated — dev was never touched). New dependencies: `nodemailer`, `libphonenumber-js`, `zustand` (`pnpm install --frozen-lockfile` clean). `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 105/105, web 15/15, API 224/224), `pnpm build`, `pnpm db:drift-check`, `pnpm test:e2e` (20 passed, 6 intentionally skipped; 4 consecutive green runs) all exit 0. Covered (API): 6-digit code emailed, only an HMAC bound to the challenge stored, 10-minute expiry; identical responses for registered/unknown emails; email normalization; phone rejected until a provider exists (normalization utility tested: `011 15 1234-5678` ≡ `+5491112345678`); resend cooldown, per-contact and per-IP limits; SMTP outage → 503 without a usable challenge; sign-up asks for the name only after a correct code and without spending it; returning sign-in; wrong/expired/reused/unknown codes give the same answer; 5 wrong attempts kill a challenge; per-IP verify limit; single use under 5 concurrent verifications; two simultaneous sign-ups of one email → one applicant; separate, non-interchangeable staff and applicant sessions; 7-day idle expiry; logout; add/remove email keeping ≥ 1 verified (`LAST_CONTACT`), `CONTACT_TAKEN`, sign-in and add-contact codes not interchangeable; public catalog requires a session, returns only active schools/groups and public fields (no CUE), min 3 letters; enrollment atomic and idempotent (5 concurrent retries → one row), same student never twice, siblings allowed, school/group association and availability checked server-side, explicit consent to the current text, extra data (e.g. DNI) rejected, idempotency keys scoped per applicant; route inventory updated deliberately with the 11 public routes; a real email delivered to Mailpit. Covered (E2E, phone profile): home → welcome with privacy acceptance → contact validation → wrong then real code read from Mailpit → refresh keeps progress → student, province, school search, group → browser back/forward between steps → consent required → confirmation → sibling registration without re-verifying → returning family signs in at `/ingresar`. Manually verified: API logs contain no email, code or name during sign-up, wrong code, search and an SMTP outage. Drafts pending legal review: privacy notice and consent texts. Deferred by plan: access-code entry and result states (Phase 10), school/group-not-found requests (Phase 11).

### Phase 10 — Matching and safe offer view

Server determines `AVAILABLE` (access granted ∧ eligible publication), `PREPARING` (access granted ∧ none eligible) or `CODE_REQUIRED` (no access yet, regardless of publication). Enter code later from `/mis-viajes`. Public snapshot view with all disclosures (cash price, down payment, financed amount, amortization system, installments schedule, TNA, TEA, CFT, total interest, total financed, total payable, validity). Record `ProposalView`. Gate: correct result for all states; drafts, expired and other groups' offers never visible; invalid codes rate-limited and non-revealing.

**Verification (2026-10-02):** migration `proposal_views` applied to test, drift checked, then dev. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 112/112, web 15/15, API 240/240; API suite 3 consecutive green runs), `pnpm build`, `pnpm db:drift-check`, `pnpm test:e2e` (23 passed, 9 intentionally skipped; 4 consecutive green runs after the Mailpit fix) all exit 0. No new dependencies. Covered (API): CODE_REQUIRED is identical with and without a publication (single and list views); the right code grants access ignoring case and separators; a wrong code and a group without a code give the same answer; another group's code does not open this one; 5 attempts per 15 min, then 429, reset after the window; code at submission — a wrong one creates nothing; access survives a code rotation while the old code no longer opens new enrollments; PREPARING for no proposal, only a draft, a not-yet-valid publication, an expired publication, an inactive group or school, a withdrawn publication; AVAILABLE shows the frozen worked example (cash price, down payment, financed, 18 installments, TNA/TEA/CFT, interest, totals, 18-row schedule) and no internal fields (publisher, catalog prices, override flags, access code, ids, version); the view always shows the current version and `ProposalView` records v1 and v2; another applicant's enrollment → 404, staff session → 401, empty list for strangers; knowing ids grants nothing (group of another school rejected). Covered (E2E, phone): code at registration → "Ver la propuesta" with every disclosure; no code → neutral message → "Mis viajes" → wrong code error → right code → offer; valid code without publication → "se está preparando". **Environment finding:** an intermittent E2E failure was traced (Playwright network trace, then direct timing) to Mailpit's reverse DNS of SMTP clients stalling its greeting ~5 s after idle periods; fixed with `MP_SMTP_DISABLE_RDNS=true` (greeting 0–2 ms after 20 s idle). Internal URLs (`SMTP_HOST`, `API_INTERNAL_URL`) were also moved to `127.0.0.1` as hardening (not proven to be a cause).

### Phase 11 — School/group-not-found requests

`No encuentro mi colegio` (`SCHOOL_NOT_FOUND`: school name, province, city, course, travel year) and `No encuentro mi grupo` (`GROUP_NOT_FOUND`, with `schoolId`). Verified applicant required. Admin list with filters, grouping of same-school demand, status update (`PENDING`, `REVIEWING`, `RESOLVED`, `DISMISSED`) and notes. Gate: request appears in admin queue; user receives neutral confirmation; per-applicant dedup and rate limits work.

**Verification (2026-10-02):** migrations `school_requests` (table, enums; hand-written partial unique index on open `dedupKey` and CHECKs) and `school_request_search` (normalized school name, added as a new migration rather than editing an applied one) applied to test, drift checked, then dev. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 116/116, web 15/15, API 250/250), `pnpm build`, `pnpm db:drift-check`, `pnpm test:e2e` (25 passed, 11 intentionally skipped; 4 consecutive green runs) all exit 0. No new dependencies. Covered (API): a missing-school report creates a request and no school, with the neutral confirmation; repeats of an open request by the same family (also written differently) create nothing and get the identical answer; requests of different families are kept and grouped (`openRequestsForSchool`); 5/hour per family; verified family session required (staff session and forged cookie rejected); input validation and no extra data; missing-group reports link and snapshot an existing active school and count demand by school; inactive school rejected; DB CHECK ties `GROUP_NOT_FOUND` to a school; staff review with notes, resolution records who, closed requests leave the open queue, reopening a since-repeated request → 409; filters by type, status and accent-insensitive text; VIEWER reads without contact data and cannot update; route inventory updated deliberately. Covered (E2E): on a phone a family that finds no school uses "No encuentro mi colegio" (city prefilled, field validation shown together), gets the neutral confirmation; a COMMERCIAL in a separate desktop session sees it under Solicitudes with type, course/year and status, opens it with the family's name and email, sets "En revisión" with a note; another family reports "No encuentro mi grupo" for an existing school. Defaults (owner informed): contact data visible to ADMIN and COMMERCIAL only. Observation: Next.js occasionally logs "The destination stream closed early" during E2E navigation; tests are unaffected (not investigated).

### Phase 12 — Dashboard

Counts for schools, groups, draft/published/expired proposals, enrollments and pending requests, with correct filters and RBAC. Gate: totals match seeded/created records; no complex charts.

**Verification (2026-10-02):** no migration, no new dependencies. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 116/116, web 15/15, API 253/253), `pnpm build`, `pnpm db:drift-check`, `pnpm test:e2e` (27 passed, 11 intentionally skipped; 5 consecutive green runs) all exit 0. **Gate** (`apps/api/test/dashboard.int.test.ts`): all zeros on an empty database; with 3 schools (1 inactive), 4 groups across two travel years (1 inactive, 1 with access code), proposals in every state (1 draft, 1 current, 1 expired, 1 scheduled, 1 archived), 3 enrollments (1 with access) and 2 requests (1 pending, 1 reviewing), every count matches exactly — unfiltered and filtered by each travel year; readable by ADMIN, COMMERCIAL and VIEWER, not by families or anonymous callers; invalid filter → 400. E2E: VIEWER sees the five cards with numbers, filters by travel year and drills down to pending requests. Fix during the phase: `schools.spec` and `services.spec` asserted a globally empty catalog, which other parallel specs can violate (a latent race that became deterministic once a spec was added); they now only rely on their own records. The "from an empty catalog" UI journey is left to Phase 13, which runs on a clean database.

### Phase 13 — E2E business journeys

Against a clean commercial DB with only the initial ADMIN: **A** staff creates school → group (+ access code) → services → proposal → publishes; applicant verifies email, onboards with code and views the offer. **B** staff creates school/group without publication; applicant with code sees `PREPARING`. **C** applicant cannot find school, reports it, staff sees pending request. Negative cases: group not in selected school, invalid pricing, invalid access code, unauthorized admin actions, simultaneous publish attempts, expired publication.

**Verification (2026-10-02):** no migration, no new dependencies, no product code changes (no defects found). New: `apps/web/e2e/journeys/` (`1-business.journey.ts`, `2-negative.journey.ts`, helpers, own global setup), `apps/web/playwright.journeys.config.ts` (one worker, file order), test-only `apps/api/scripts/expire-test-proposal.mjs` (refuses non-`_test` DBs), `pnpm test:e2e:journeys`; `pnpm test:e2e` now runs both suites in sequence. `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (shared 116/116, web 15/15, API 253/253), `pnpm build`, `pnpm db:drift-check` exit 0; `pnpm test:e2e` 3 consecutive green runs (feature specs 27 passed / 11 intentionally skipped; journeys 9/9). **Gate:** the journeys start on a DB with only the initial ADMIN (asserted: one user, all dashboard counts 0, empty school list). **A** ADMIN creates school → group → access code → 3 services → proposal (server-priced DOMAIN.md worked example, total $ 1.499.553,21) → publishes; a family on a phone verifies its email (Mailpit), finds the group, registers with the code typed in lowercase without dash and sees the same disclosed figures; dashboard shows exactly 1 current publication and 1 enrollment with access. **B** group with code, no publication → done step and Mis viajes show "en preparación", no offer link. **C** unknown school reported → staff dashboard 1 pending, queue row with contact; no catalog school is created. **Negative:** group of another school is not listed and a tampered enrollment is rejected (400, no enrollment created); invalid pricing (empty draft, TNA 70 %, down payment > cash price, missing/past validity) is rejected by the server and nothing is published; wrong code at registration rejected, interest kept as CODE_REQUIRED, rotated old code rejected, new code opens the offer; anonymous and family sessions get 401 on admin API, VIEWER 403 on writes and denied pages, COMMERCIAL 403 on user management; two staff sessions clicking "Crear propuesta" and then "Publicar" simultaneously → exactly one draft and one publication, the other gets the 409 message; an expired publication (simulated) disappears for the family (PREPARING), counts as "Publicadas vencidas", its copy cannot be published with the past date, and a new version with a future date is offered again.

### Phase 14 — Hardening

Run typecheck, lint, tests, build, migrations and E2E; inspect loading/empty/error states, responsive UI, accessibility, authorization, rate limiting, privacy, audit, rounding, indexes and concurrency. Document unresolved legal/commercial decisions (see `DOMAIN.md` → Production blockers) as deployment blockers. Gate: no critical known defects; do not claim production readiness without security/privacy/legal approval.

**Verification (2026-10-02):** four read-only reviews (security/authorization, privacy/logging/audit, money/DB/concurrency, UI states/accessibility) found **no critical defect and no route-authorization hole**; every finding was verified in code before fixing. Fixed, with tests:
- **Limits under concurrency:** OTP verify reserves one of the 5 attempts atomically before comparing (20 concurrent guesses → exactly 5 attempts). Staff login/change-password reserve the failure before argon2 (15 concurrent → 5×401 + 10×429). `RateLimiter` prunes by each key's own window and fails closed when full.
- **Proposals:** optimistic concurrency — `PUT`/publish take `expectedUpdatedAt`; a stale value → 409 `PROPOSAL_CHANGED`. The builder always sends it.
- **Data and attribution:**
  - Hourly purge of OTP challenges (1 day after expiry) and expired sessions.
  - Migration `hardening_indexes`: replaces an unused email index with `OtpChallenge(expiresAt)` and adds `SchoolRequest(status, createdAt)`.
  - Editing notes no longer re-attributes who closed a request.
  - Staff notes are hidden from VIEWER (privacy-protective default, owner to confirm).
  - A valid access code is kept when two submissions race.
- **Errors and headers:**
  - `page` ≤ 10 000 and group `travelYear` 2000–2100 (400 instead of 500).
  - Unmapped Prisma errors → 404/409/400, never internals.
  - Security headers on API (incl. `no-store`) and web.
- **Configuration:**
  - `NODE_ENV` is required and local secrets are rejected in production.
  - `.gitignore` covers every `.env*`.
  - Docker ports are bound to 127.0.0.1.
  - `pnpm audit` is clean via overrides for two Prisma CLI transitive dependencies.
- **Web:**
  - Spanish `not-found`/`global-error`/`admin/error`/`(public)/error` pages; login renders even if the session check fails.
  - Family "Salir" on Mis viajes and the offer page; sign-in resets the previous person's draft; less personal data kept in sessionStorage.
  - Focus management and `role=alert` errors; "Buscando…" and "Reintentar" states; 44 px touch targets; visible focus ring; `aria-current` nav.
  - Role change requires confirmation; preview errors distinguished from validation; UUID-checked offer route; client fetch timeout.
  - The experimental `authInterrupts` flag was proposed and rejected: a 403 falls back to `admin/error.tsx`.

Migrations: all 12 apply on a fresh database; `pnpm db:drift-check` reports no difference.

`pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm build`, `pnpm test` (shared 116/116, web 18/18, API 269/269) exit 0. `pnpm test:e2e`: 3 consecutive green runs (feature specs 31 passed / 11 intentionally skipped, incl. new header and 404 checks; journeys 9/9, incl. a stale-draft publish refused).

**Accepted residual risks** are documented in ARCHITECTURE.md ("Known low-risk limitations"; the per-email login lockout). **Owner/legal decisions** are listed as production blockers in DOMAIN.md: retention, data subject rights, final privacy/consent texts, re-acceptance, minimum staff audit trail, VIEWER notes, deployment checklist, and a security review.

### Phase 15 — Demo and handoff

Seed sample school with a published group offer (access code printed by the seed), another school/group without offer, and a pending school request. README covers installation, env vars, migrations, seed, demo staff credentials (development only), Mailpit usage, test commands and three journeys. Gate: another engineer can reproduce demo from instructions.

**Verification (2026-10-02):**

**Minimum installment.** The owner set it on 2026-10-02 (F-g): every installment the family pays, principal plus interest, must be at least $ 100.000,00.
- Implemented as a commercial rule separate from the formula, with tests:
  - the boundary at exactly $ 100.000,00
  - the last French installment
  - the "hasta N cuotas" message
  - a cash sale
  - a property test: a plan is accepted exactly when every installment reaches the minimum
- The worked example changed to $ 3.000.000 cash price, $ 600.000 down payment and 18 × $ 173.273,76 (total $ 3.718.927,69), because the owner's original example breaks the rule. This replacement is **pending owner confirmation**.

**Demo.**
- `pnpm demo:seed [--reset]` builds the demo through the real services. It refuses `NODE_ENV≠development` and a database with existing data; `--reset` refuses `_test` databases.
- It creates:
  - three demo staff accounts with documented dev-only passwords
  - a school with a published offer and its access code (printed)
  - a school whose group has a code but no offer
  - a pending school request
- Tested by `test/demo-seed.int.test.ts`. The CLI was exercised on a scratch database: create, refuse on a non-empty database, `--reset`, refuse in production.

**README.** Rewritten for handoff: getting started with a demo or an empty database, demo credentials and data, Mailpit, the three journeys step by step, a tests table, and port overrides (including running a second copy).

**Reproducibility gate.** An independent agent copied the repo without artifacts and followed the README on isolated Docker ports. Results:
- install, migrations, seed and dev all worked
- over HTTP: health check, staff login, dashboard counts, journey A (AVAILABLE, total 371892769), journey B (PREPARING) and journey C (pending request)
- `pnpm test` gave 412/413

Fixed afterwards:
- the Mailpit integration test and the E2E helper hardcoded port 8025; they now read `MAILPIT_API_URL` from `.env.test`
- README gaps: how to override ports, `COMPOSE_PROJECT_NAME`, the `SMTP_PORT` in both env files, Playwright being needed only for E2E, the `Secure` cookies when scripting

**Final run.** `pnpm typecheck`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm build`, `pnpm db:drift-check` and `pnpm audit` (0 vulnerabilities) all pass. `pnpm test`: shared 116/116, web 18/18, API 279/279. `pnpm test:e2e` was green in 3 consecutive runs: 31 feature specs passed and 11 were intentionally skipped, and 9/9 journeys passed (including a new minimum-installment step).

**Observation.** A Next.js log line, "destination stream closed early", appears during E2E when a navigation interrupts a streamed response. It was already present in Phase 14 and has no effect on results.

## Acceptance criteria / Definition of Done

1. A staff user can create **School → SchoolGroup → Service → Draft proposal → Priced payment plan → Published proposal** entirely from UI without manual DB editing.
2. SchoolGroup belongs to exactly one existing School and proposals belong to groups, not directly to schools.
3. Pricing is deterministic, exact to the cent, explainable and verified server-side; published prices remain frozen across catalog edits.
4. Only one current published proposal and one draft per group; edits to a published proposal require a new version.
5. A verified applicant with the group's access code can complete onboarding and see the correct published proposal; a group without one shows `PREPARING`; without a code, nothing about the offer is revealed.
6. A missing school or group produces a staff-visible request, not a fake school or group.
7. RBAC, validation, tests, migrations and local demo work; documentation matches the implementation.

## Decision log

Answered by the product owner on 2026-10-02 (review delivered 2026-10-01). Details in `DOMAIN.md` / `ARCHITECTURE.md`.

| ID | Decision | Outcome |
|---|---|---|
| B1 | Pricing unit | Per passenger; `PER_PASSENGER` only in MVP; never multiply by `estimatedStudents` |
| B2 | Financing model | Initially "flat surcharge"; **superseded** by F-a: French amortization with TNA/TEA/CFT |
| B3 | Fixed vs indexed installments | Fixed nominal installments + required `validUntil` |
| B4 | Taxes/fees | Final, tax-included consumer prices; no tax calculation |
| B5 | Down payment/discounts/limits | Absolute centavo amounts; down payment 0…cash price; max 36 installments |
| B6 | Overrides and publishing | ADMIN and COMMERCIAL override unit prices and publish; no approval workflow |
| B7 | Public access | Group access code (hashed, shown once, rotatable) gates `AVAILABLE`; verified applicant identity (replaces the access-link token idea) |
| B8 | Minors/consent | Flow for the responsible adult; data minimization; consent version recorded; retention TBD with legal |
| B9 | Group identity | `travelYear` = trip year; unique `(schoolId, normalizedName, travelYear)` |
| B10 | School identity | Soft duplicate warning; optional unique CUE; province enum |
| B11 | Missing group | Single request table with `type` |
| B12 | Validity | `validUntil` required to publish; expired → `PREPARING` |
| B13 | `included` flag | Removed; optional extras out of MVP |
| B14 | Staff provisioning | CLI first ADMIN; ADMIN manages users and temporary passwords |
| T1 | Identity split | Accepted, plus: applicants verified by email or phone; one verified contact is enough |
| T2–T5, T7, T10 | BigInt money, UUIDv7, versioning model, hand-written SQL, Zod shared, sessionStorage draft | Accepted |
| T6 | Server sessions vs JWT | Accepted after rationale (ADR-07) |
| T8 | Abuse/dedup | Accepted; applicant has opaque ID, may change email/phone but always keeps ≥ 1 verified; phone dedup via E.164; CAPTCHA later |
| T9 | Search | Accepted; by name, city and province |
| T11 | Tooling | pnpm, Docker Postgres and Playwright in Phase 1 (smoke test) accepted |
| F-a | Rate convention | French system, monthly rate = TNA/12 |
| F-b | Extra costs | None for now → CFT = TEA |
| F-c | Max rate | TNA 66 % |
| F-d | Dates | Numbered monthly installments, no due dates; dates to be considered later |
| F-e | Verification scope | Email OTP in MVP (Mailpit in dev); phone later with provider — scope change |
| F-f | Verification step | Immediately after the contact step |
| F-g | Minimum installment | $ 100.000,00 per installment the family pays (principal + interest), owner 2026-10-02; replaces the provisional $ 1,00 floor as the business rule. Worked example changed to $ 3.000.000 / $ 600.000 / 18 × $ 173.273,76 (pending owner confirmation) |

## Post-MVP changes approved by the owner

Built after the MVP gates, each requested and approved explicitly; MVP phase statuses above are unchanged.

| Date | Change | Notes |
|---|---|---|
| 2026-10-02 | Fixed verification code for development/test (`OTP_FIXED_CODE`, e.g. `123456`) | Env validation refuses it with `NODE_ENV=production`; the API logs a warning (never the code) when set |
| 2026-10-02 | Onboarding redesign (photo hero, stepper, 6-box code input) and optional Three.js backdrop (`NEXT_PUBLIC_ONBOARDING_3D=1`, off by default) | Decorative, `aria-hidden`, reduced-motion and no-WebGL fallbacks; flow, validations and API unchanged |
| 2026-10-02 | Staff analytics dashboard (`GET /api/admin/dashboard/analytics`) and admin UI restyle | Aggregates only, no personal data; see ARCHITECTURE.md route table |
| 2026-10-03 | Per-group services divided among passengers (formula `french-tna12-v2`) | Divisor set per proposal and frozen at publication; shares rounded up to the centavo; families see only their share. DOMAIN.md → Per-group lines |
| 2026-10-03 | Installment tiers 3/6/12/18/24 offered up to the chosen maximum, payment-option carousel and "Me interesa" plan preference (`PUT /public/enrollments/:id/preference`) | Same down payment and TNA per option; tiers below the minimum installment are left out; preference is interest only, staff see counts. DOMAIN.md → Installment tiers |

## Post-MVP roadmap (not authorization to build)

| Stage | Capabilities | Trigger |
|---|---|---|
| Product Phase 2 | Approval workflow, pricing rule/rate tables, phone verification, notifications, installment due dates, CRM integration, analytics and stronger audit | Commercial process validated |
| Product Phase 3 | Python/FastAPI optimization/recommendation using approved pricing constraints | Sufficient complex combinations justify it |
| Product Phase 4 | RAG assistant over approved contracts, FAQs and service policies | Curated, versioned knowledge sources available |
| Product Phase 5 | Historical conversion/scoring, A/B analysis and advanced forecasting | Sufficient consented and reliable historical data |

## Claude session prompt

```text
Read CLAUDE.md and docs/MVP_PLAN.md, docs/ARCHITECTURE.md, docs/DOMAIN.md.
Inspect the actual repository and report the current phase status.
Continue only the next approved phase. Do not advance automatically; stop for review at the end of the phase.
```
