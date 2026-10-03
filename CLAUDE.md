# Travel Rock Commercial Platform — Agent instructions

## Mission
Build an MVP that allows Travel Rock staff to create a school, associate a school group, configure and publish a priced commercial proposal, and allows a student/family to find that published proposal through onboarding. Read `docs/MVP_PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/DOMAIN.md` before changing code. These files describe the intended design, not proof of existing implementation.

## Working protocol
1. Inspect the actual repository and report what exists before implementing.
2. Follow the next approved phase in `docs/MVP_PLAN.md`; **do not advance automatically**. Start with Phase 0 (architecture review), and do not write application code until approved.
3. Before each phase, state scope, planned files, assumptions, and acceptance criteria. Ask about unresolved consequential product/financial decisions; do not silently invent contractual terms.
4. Implement only the approved scope. Run available typecheck, lint, relevant tests, and build; report exact commands and failures honestly.
5. Update phase progress and documentation after verified work. Stop for review.
6. Never mark a phase done merely because files were generated.

## Stack and boundaries
- TypeScript monorepo: `apps/web` (Next.js App Router, React Hook Form, Zod, Zustand, Tailwind) and `apps/api` (NestJS, Prisma, PostgreSQL); optionally `packages/shared` for pure shared contracts.
- Modular monolith. REST. NestJS owns authorization, commercial state, pricing and persistence.
- No Python, FastAPI, LLM, RAG, Redis, Kafka, microservices, payments, signatures, external notifications or production Three.js in the MVP. Sole approved exception (2026-10-02): transactional email OTP codes for applicant verification (Mailpit locally; production provider TBD).
- Separate pure pricing domain logic from controllers and database access. Never trust client-provided totals.
- Preserve published proposal versions and immutable financial snapshots. Never modify historical published prices in place.
- All financial values in integer minor units (ARS cents for this MVP) or a documented exact decimal representation. No naive floating-point money calculations. Rates use integer basis points; document formula and rounding.
- `School 1:N SchoolGroup 1:N CommercialProposal`. Staff can create schools, groups and services from an empty commercial database; demo seeds are optional.
- No automatic acceptance of an offer, binding contracts or payment processing. Enrollment represents an expression of interest only.

## Security and privacy
- Admin routes require server-side authentication and RBAC (ADMIN, COMMERCIAL, VIEWER).
- Student onboarding is a separate public flow with explicit consent and appropriate access controls. Never expose a proposal by merely guessing a school/group ID without applying the agreed visibility policy.
- Avoid collecting unnecessary student data; assume minors may participate. Determine adult/guardian consent and privacy/legal requirements with the product owner before production rollout.
- Validate DTOs, rate-limit public endpoints, prevent duplicate submissions, and avoid logging PII or credentials. Keep secrets in environment variables.

## Source of truth and conflicts
- `docs/MVP_PLAN.md`: scope, phases, acceptance criteria and progress.
- `docs/ARCHITECTURE.md`: proposed technical design and ADRs.
- `docs/DOMAIN.md`: entities, invariants, workflows, pricing definitions.
- Actual implementation is authoritative for *what exists*; documents are authoritative for *intended behavior*. Surface discrepancies and request approval before changing major design decisions.
- Business pricing, installment interest, eligibility, permissions and publication rules must be approved before production use.

## Code quality
- Prefer simple explicit code, strict TypeScript, small cohesive modules, validated inputs, readable naming and focused tests.
- Avoid generic repositories, base controllers, unnecessary CQRS/event sourcing and premature abstractions.
- Use transactions and database constraints for version publication and uniqueness; include concurrency tests.
- Maintain `.env.example`, README and migration instructions. Do not commit secrets.

## First action
Review all docs, identify open decisions, and produce Phase 0 architecture feedback only. Do not bootstrap code until the user approves Phase 0.
