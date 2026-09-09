# AGENTS.md — Saju Project Context

## Current Status / Next Step

* Phase A 완료
* 표면 오행 단순 집계 완료
* 지장간 raw data 완료
* 지장간은 lunar-javascript 표 기반 직접 매핑
* 관련 테스트 38개 통과
* 다음 작업: 지장간 정책 검증 후 오행 분석 방법론 결정

## Purpose

This repository is a Korean Saju (사주/만세력) web service MVP.

Primary business goal:
- Launch quickly.
- Integrate small-value payments later.
- Validate whether users will pay for detailed Saju interpretations.
- Keep infrastructure cost extremely low and predictable.
- Avoid overengineering until revenue/traffic justifies it.

This file is the persistent project context for Codex.
Read and follow it before making changes.

---

## Current Technology Stack

Frontend / full-stack framework:
- Astro 6
- TypeScript

Infrastructure:
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2 planned, not yet integrated
- No AWS infrastructure in the current MVP

Database:
- Cloudflare D1 (SQLite-based)
- Drizzle ORM
- Drizzle Kit migrations

Saju calculation:
- `manseryeok` library as the base/calendar calculation engine
- Our own wrapper and analysis layer on top
- Hybrid strategy: do not let the external library leak throughout the application

Testing:
- Vitest
- `npm run test:run` runs the complete test suite

Deployment:
- Cloudflare Workers
- Current deployed Worker:
  `https://saju.dydcks4.workers.dev/`

Runtime:
- Node.js 22 LTS for local development
- Wrangler 4.x

---

## Core Architecture

The intended request flow is:

Browser
→ Astro
→ Cloudflare Worker
→ Drizzle
→ D1

External services will later be called from the Worker, not directly from the browser:

Browser
→ Worker
→ Toss Payments / Google OAuth / LLM API

Do not expose provider secret keys to browser code.

Cloudflare resources planned:
- Workers: application/server runtime
- D1: relational application data
- R2: generated files, reports, images
- Turnstile: bot protection
- Rate Limiting: abuse/cost protection

---

## Important Astro 6 Rule

Do NOT use old Astro Cloudflare access patterns such as:

```ts
locals.runtime.env
Astro.locals.runtime.env
```

Those were removed in Astro 6.

Use:

```ts
import { env } from 'cloudflare:workers'
```

Example:

```ts
const db = createDb(env.saju_db)
```

---

## Cloudflare D1 Binding

The D1 binding name is intentionally:

```text
saju_db
```

Do NOT rename it to `DB` unless explicitly requested.

Expected Wrangler D1 configuration conceptually looks like:

```jsonc
"d1_databases": [
  {
    "binding": "saju_db",
    "database_name": "saju-db",
    "database_id": "...",
    "migrations_dir": "drizzle",
    "migrations_pattern": "drizzle/*/migration.sql"
  }
]
```

The actual `database_id` in the repository is authoritative.

---

## Drizzle

Database connection helper:

```ts
import { drizzle } from 'drizzle-orm/d1'

export function createDb(d1: D1Database) {
  return drizzle(d1)
}
```

Interpretation:
- `env.saju_db` is the actual Cloudflare D1 binding.
- `D1Database` is the TypeScript type for a Cloudflare D1 database object.
- `drizzle(d1)` wraps D1 with Drizzle's typed query layer.
- Drizzle does NOT store a copy of the data.
- D1 remains the actual database.

Keep application database access behind Drizzle unless raw SQL is clearly preferable.

---

## Migration Workflow

Schema source:
- `src/db/schema.ts`

Drizzle configuration:
- `drizzle.config.ts`

Generated migrations:
- `drizzle/*/migration.sql`

Normal workflow:
1. Modify `src/db/schema.ts`
2. Run `npx drizzle-kit generate`
3. Inspect generated migration SQL
4. Apply locally: `npx wrangler d1 migrations apply saju-db --local`
5. Test locally
6. Apply remotely only after validation: `npx wrangler d1 migrations apply saju-db --remote`
7. Deploy

Do NOT casually use schema push commands against production.
Migration history must be committed to Git.

---

## Current Database Schema

### users

Purpose:
- Core service user identity.

Important fields:
- `id` TEXT primary key
- `email` TEXT, unique
- `name`
- `profile_image_url`
- `created_at`
- `updated_at`

Important index:
- unique index on `email`

### auth_accounts

Purpose:
- External OAuth identities.
- Designed to support Google now and Kakao/Apple later.

Important fields:
- `id`
- `user_id` → users.id
- `provider`
- `provider_account_id`
- `created_at`

Important indexes:
- unique `(provider, provider_account_id)`
- index on `user_id`

Do not put `google_id` directly on `users` unless architecture is deliberately changed.

### saju_profiles

Purpose:
- Raw user Saju input.

Important fields:
- `id` TEXT primary key (UUID)
- `user_id` nullable
- `birth_date`
- `birth_time` nullable
- `gender`
- `calendar_type`
- `is_leap_month`
- `created_at`
- `updated_at`

Important index:
- index on `user_id`

`user_id` is intentionally nullable:
- Anonymous users can create a Saju profile.
- Login/account linking can happen later.

### saju_results

This table has been planned/added during development for computed results.
Before using it as authoritative cache, confirm the current migration/schema in the repository.

Current design intent:
- one computed result per profile
- `profile_id` should be unique
- result can initially be stored as JSON

Do not persist calculated results until calculation policy is considered stable.

---

## Current Working User Flow

Already working locally:

1. User opens the home page.
2. User enters:
   - birth date
   - birth time
   - gender
   - solar/lunar calendar
   - leap month when relevant
3. Browser POSTs to `/api/saju/profile`
4. Worker validates input.
5. D1 inserts a `saju_profiles` row.
6. API returns `profileId`.
7. Browser redirects to `/result/{profileId}`
8. Dynamic Astro page queries D1 using the primary key.
9. Stored profile data is displayed.
10. Saju calculation runs through the local wrapper around `manseryeok`.

Dynamic result page must use:

```ts
export const prerender = false
```

because profile UUIDs are generated at runtime.

---

## Saju Engine Architecture

Do NOT import `manseryeok` throughout the project.

Keep the boundary:

```text
UI / pages
→ calculateSaju()
→ our engine wrapper
→ manseryeok
```

Current intended files:

```text
src/lib/saju/
├─ engine/
│  └─ manseryeok.ts
├─ calculator.ts
├─ calculator.test.ts
└─ types.ts
```

Responsibilities:

### `engine/manseryeok.ts`
Only place that should directly know about the external `manseryeok` package.

Responsibilities:
- convert our `SajuInput` into library input
- invoke `manseryeok`
- normalize library output into our own types

### `calculator.ts`
Our service-level Saju API.

Currently delegates to the manseryeok wrapper.

Eventually this layer will combine:
- base pillars
- five elements
- ten gods
- strength analysis
- luck cycles
- application-specific scoring/interpretation data

### `types.ts`
Our application-owned types.

Do not expose external library types to UI/pages if avoidable.

This allows replacing `manseryeok` later without rewriting the whole application.

---

## Current Saju Calculation Policy

Base engine:
- `manseryeok`

Current default day boundary policy:
- `midnight`

Explicitly keep the default in our wrapper rather than relying on the library's implicit default.

Example:

```ts
dayBoundary: input.dayBoundary ?? 'midnight'
```

Supported/tested policies:
- `midnight`
- `jasi`
- `splitJasi`

Current MVP UI should NOT expose these advanced options yet.

---

## True Solar Time Policy

True solar time support has been tested through `manseryeok`.

Current MVP policy:
- true solar time OFF by default

Reason:
- current user form does not collect birthplace/longitude
- do not claim precise geographic solar-time correction without birthplace data

Potential future advanced flow:
- collect coarse birthplace (city/region)
- map it to longitude
- optionally enable true solar time

Do not collect full street addresses solely for Saju calculation.

---

## Test Status

Current calculator and surface-element analyzer test suites:

```text
33 tests passing (22 calculator + 11 analyzer)
2 test files passing
```

Command:

```bash
npm run test:run
```

The original calculation-policy tests verify:
1. Normal solar-calendar Saju calculation
2. Birth time missing → hour pillar returned as null by our wrapper
3. Birth hour changes can change the hour pillar
4. Leap-month flag is ignored for solar-calendar input
5. Equivalent solar/lunar dates produce the same pillars
6. Day-boundary policy changes at 23:xx
7. `midnight`, `jasi`, `splitJasi` policies
8. `splitJasi` day/hour behavior
9. Lichun (입춘) year boundary
10. Lichun exact boundary ±1 minute
11. Solar-term list retrieval
12. Gyeongchip (경칩) month boundary ±1 minute
13. Lunar leap-month date equals its corresponding solar date
14. Normal lunar month vs leap lunar month differ
15. True solar time can change the hour pillar

Observed validated examples include:

1991-01-02 13:04, female, solar:

```text
년주 경오
월주 무자
일주 임신
시주 정미
```

23:30 day-boundary observation:

```text
midnight   → 임신
jasi       → 계유
splitJasi  → 임신
```

1991 Lichun:
- 1991-02-04 17:08 Asia/Seoul
- 17:07 → 경오 year
- 17:09 → 신미 year

1991 Gyeongchip:
- 1991-03-06 11:12 Asia/Seoul
- 11:11 → 경인 month
- 11:13 → 신묘 month

Leap-month test:
- lunar 2020 leap month 4, day 1
- corresponds to solar 2020-05-23 in the test case

True solar-time test example:
- normal: day 경진 / hour 경진
- corrected: day 경진 / hour 기묘

Do not delete these boundary tests casually.
They are regression tests for calculation policy.

---

## Current Development Status

Phase A is complete: normalized raw elements and ten gods are displayed.
Phase B's first step is complete: `src/lib/saju/analyzer/elements.ts` counts
surface stem/branch elements from `SajuResult.elements`, with 8 total when
birth time is known and 6 when unknown. The result page labels this as
"표면 오행 분포" and explains that counts do not measure strength.
Hidden-stem raw data is complete, directly mapped from the lunar-javascript table.
Related tests: 38 passing.
Next: validate the hidden-stem policy first, then decide the element-analysis methodology before advanced interpretation.
Weighted strength, percentages, and interpretations remain unimplemented.
Development history: `docs/SAJU_DEVELOPMENT_LOG.md` (step 36).

Important:
- Do NOT immediately invent "wood 30%, fire 20%" scoring.
- Raw five-element mapping and weighted strength analysis are different concepts.
- Element strength can depend on seasonal/month influence, hidden stems, and chosen interpretation methodology.
- First expose objective/raw data.
- Build scoring in a separate analysis layer.

---

## Important Cost / Performance Rules

The project owner explicitly wants warnings during development about hidden cost/performance/security pitfalls.

Always call out relevant caveats when changing code.

Security note: miniflare currently pulls sharp@0.35.2 (<0.35.4 vulnerable), but current production Worker does not bundle or execute sharp. Do not introduce untrusted image processing without re-evaluating this dependency.

### D1 row reads

Cloudflare D1 cost/performance depends on rows read/written.

Avoid accidental full scans.

Bad pattern:

```sql
SELECT *
FROM a_large_table
WHERE unindexed_column = ?
```

For frequent lookup columns, design indexes intentionally.

Examples already important:
- `users.email` → unique index
- `auth_accounts(provider, provider_account_id)` → unique index
- `auth_accounts.user_id` → index
- `saju_profiles.user_id` → index
- `saju_profiles.id` → primary-key lookup

Do not assume Drizzle prevents poor SQL/index design.
It does not.

Prefer:
- narrow selects
- indexed predicates
- sensible `LIMIT`
- cursor/keyset pagination when lists get large

### D1 writes / abuse

Public POST endpoints can be abused and create large write volume.

Before production launch, add:
- rate limiting
- Cloudflare Turnstile where appropriate
- server-side validation

### LLM cost

This is likely more dangerous than Worker/D1 cost.

Never allow a public endpoint to trigger unlimited LLM calls.

Before invoking an LLM:
1. authenticate/identify request as needed
2. verify purchase/entitlement
3. verify whether result already exists
4. enforce per-user/order rate limits
5. make generation idempotent
6. then invoke the LLM

### External API secrets

Never put:
- Toss secret key
- LLM API key
- Google client secret

in client-side code.

Use Worker secrets/environment bindings.

### Payment

When Toss Payments is added:
- browser success is NOT proof of payment
- Worker must verify/confirm with Toss
- check expected amount
- check order id
- make payment processing idempotent
- enforce unique `order_id`
- enforce unique provider payment key where appropriate

### Result authorization

Current anonymous `/result/{UUID}` URLs are acceptable for the early free MVP.

Do NOT rely on UUID secrecy for paid/private content.

When paid/private results are introduced:
- verify ownership/session/entitlement before returning content

---

## Privacy Rules

Saju requires birth-related personal data.

Collect only what is required.

Current raw profile:
- birth date
- birth time
- gender
- solar/lunar calendar
- leap month

Avoid collecting unnecessary:
- full address
- phone number
- unrelated personal identifiers

If birthplace is later required for solar-time correction, prefer city/region or longitude rather than a full street address.

---

## Coding Style / Architecture Rules

Prefer small, explicit modules.

Astro API route:
- HTTP parsing
- validation
- status codes
- call application/service logic
- do not accumulate large business logic

Use:
- pages/routes for HTTP/UI
- `src/lib` for business logic
- `src/db` for DB/schema/access helpers
- `src/lib/saju` for Saju engine/analysis

Use parameterized queries / Drizzle predicates.
Never concatenate untrusted input into SQL.

Prefer application-owned types at boundaries.

Do not use unsafe TypeScript `as` casts to hide invalid DB values when runtime validation is feasible.

---

## Validation Philosophy

Client validation:
- UX convenience

Server validation:
- security and data integrity

Never trust browser `required` attributes or client-supplied values.

For enum-like DB values such as:
- `gender`
- `calendarType`

validate before calculation/use.

---

## Development Workflow

Before modifying functionality:

1. Read this `AGENTS.md`
2. Inspect relevant current files before changing them
3. Preserve established architecture unless there is a reason to improve it
4. Mention any material cost/security/performance concern
5. Add/update tests for calculation behavior or regressions
6. Run `npm run test:run`
7. If DB schema changed:
   - generate migration
   - inspect SQL
   - apply local migration
   - test locally
   - do NOT apply remote migration without deliberate intent

When Codex changes code, prefer making the actual code change rather than only describing it, unless the user asks for explanation only.

---

## Near-Term Roadmap

Continue from this point:

### Phase A — Saju result model expansion

Status: complete.

1. Inspect current `manseryeok` result types/API in the installed package
2. Add normalized raw five-element information to our application type
3. Add tests
4. Display it on result page
5. Add normalized ten-gods information
6. Add tests
7. Display it on result page

Do not over-interpret yet.

### Phase B — Analysis layer

Separate objective base calculations from interpretation.

Completed: surface-element integer counts in `analyzer/elements.ts`, result UI,
and 11 unit tests. The existing manseryeok wrapper is unchanged.
Next: agree on the next analysis scope (for example, raw hidden stems) and its
methodology. Do not automatically add strength scoring or persistence.

Possible modules:

```text
src/lib/saju/analyzer/
├─ elements.ts
├─ ten-gods.ts
├─ strength.ts
└─ fortune.ts
```

Do not claim strength scoring is objective without defining methodology.

### Phase C — Persistence

Only after calculation policies stabilize:
- decide final `saju_results` schema
- persist/cache computed normalized results
- make writes idempotent
- decide versioning strategy so algorithm changes can invalidate/recompute old results

A result/version field may become useful, e.g.:
- engine name/version
- analysis version
- calculated_at

### Phase D — Product

Later:
- Google OAuth
- Toss Payments
- paid detailed results
- LLM interpretation
- R2 reports/images
- Turnstile/rate limits
- Kakao login if needed

---

## Critical Product Principle

This is a revenue-validation MVP, not an infrastructure showcase.

Favor:
- simple
- cheap
- testable
- reversible decisions
- fast launch

Avoid:
- unnecessary AWS services
- premature distributed architecture
- premature queues/caches
- premature microservices
- unnecessary user data collection

Only add infrastructure when a real product/traffic requirement justifies it.

## Codex Efficiency Rule

For small changes:
- inspect only relevant files
- make minimal changes
- run targeted tests only
- do not run full build/check unless explicitly requested
- batch documentation updates after several completed features

## Project Context Scope

- For ordinary development tasks, use only AGENTS.md as project instructions.
- `docs/SAJU_DEVELOPMENT_LOG.md` is the user's retrospective document. Read or load it into context only when explicitly requested by the user.
- For ordinary tasks, inspect only files directly relevant to the user's request.
