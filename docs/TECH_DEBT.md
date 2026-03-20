# Technical Debt Registry

Last updated: 2026-03-20

This document tracks known technical debt. Each item includes severity, scope, and a suggested fix. Items are prioritized for future sprints.

## Critical

### TD-001: `any` types across the codebase

- **Scope:** ~372 files use `any` (mostly API responses, state, event handlers)
- **Impact:** Bypasses TypeScript's safety — bugs reach production that the compiler could catch
- **ESLint status:** `@typescript-eslint/no-explicit-any` set to `"warn"` (not `"error"`)
- **Fix:** Incrementally replace `any` with proper types or `unknown`. Start with `lib/` and `domains/`, then `components/`, then `app/`.
- **Target:** Flip eslint rule to `"error"` once count is below 50
- **Progress:** Critical routes (ops/status, sync-ml-stock, batch import error handler) cleaned up in hardening round 3

### TD-002: `noUncheckedIndexedAccess` disabled

- **File:** `tsconfig.json`
- **Impact:** Array/object index access returns `T` instead of `T | undefined`, hiding null-check bugs
- **Current errors:** ~100 when enabled (363 lines of TS output = ~100 distinct errors)
- **Fix:** Enable flag, fix errors file by file. Mostly adding `?? defaultValue` or `if (x != null)` guards.
- **Strategy:** Enable per-file with `// @ts-check` or fix in batches of ~20 files per PR. Priority files: `domains/mercadolibre/`, `lib/import/`, `app/api/cron/`.

## High

### TD-003: Hardcoded colors breaking dark mode

- **Scope:** 13 instances of `bg-white` or `text-black` in `app/` and `components/`
- **Fix:** Replace with `bg-background` / `text-foreground` tokens
- **Risk:** Low — purely visual, easy to grep and fix

### TD-004: Client-side fetching in dashboard pages

- **Scope:** ~30 pages still use `useEffect` + `fetch` for initial data load
- **Impact:** Slower page loads, no SSR, no SEO (not critical for dashboard, but not ideal)
- **Fix:** Convert to Server Components with `async` data fetch, or use SWR hooks
- **Progress:** Main dashboard page converted to server component in hardening round 3
- **Priority:** Medium — works correctly, just suboptimal

### TD-005: `@typescript-eslint/no-unused-vars` set to `warn`

- **Current count:** ~181 instances
- **Fix:** Clean up unused imports/variables, then flip to `"error"`
- **Risk:** None — pure cleanup

### TD-013: `skipLibCheck: true` required

- **File:** `tsconfig.json`
- **Reason:** `lucide-react@0.454.0` has type errors with React 19 (`ReactSVG` not exported)
- **Fix:** Wait for lucide-react to ship React 19-compatible types, then try disabling `skipLibCheck`
- **Workaround:** None needed — `skipLibCheck` only skips checking `.d.ts` files in `node_modules`

### TD-014: `[v0]` legacy logging prefix

- **Scope:** ~141 files still use `console.log("[v0] ...")` or `console.error("[v0] ...")`
- **Impact:** Cosmetic, but pollutes logs with legacy branding
- **Fix:** Global find-and-replace `[v0]` → structured logger or context-specific prefix
- **Progress:** Critical routes (webhooks, crons) cleaned up in hardening round 3

## Medium

### TD-006: No integration/E2E tests

- **Current state:** Vitest is configured with 8 unit test files (import-pro, ML client)
- **Fix:** Add tests for critical paths: stock sync, ML import, Shopify push
- **Priority:** Medium — manual testing works but doesn't scale

### TD-007: Large page files

Some pages exceed 500 lines with mixed concerns:

| File | Lines | Issue |
|------|-------|-------|
| `app/(dashboard)/integrations/ml-templates/page.tsx` | ~700 | Template editor + preview + API calls |
| `app/(dashboard)/integrations/ml-publish/page.tsx` | ~650 | Publish flow + form + results |
| `app/(dashboard)/shipments/page.tsx` | ~600 | Table + filters + actions |
| `app/(dashboard)/pagos/page.tsx` | ~500 | Payments table + filters |

**Fix:** Extract sub-components, custom hooks for data fetching, form logic to separate files.

### TD-008: Inconsistent error handling in API routes

- Some routes return `{ error: string }`, others return `{ message: string }`
- Some throw unhandled errors that produce HTML responses
- **Fix:** Adopt `handleRouteError()` from `lib/errors/handle-route-error.ts` and `apiError()` from `lib/api/response.ts` across all routes
- **Progress:** Standardized in batch import, webhook process, and ops/status routes in hardening round 3

### TD-009: No rate limiting on public API endpoints

- **Scope:** `/api/cron/*`, `/api/webhooks/*`, supplier import endpoints
- **Current mitigation:** Vercel infra provides basic DDoS protection + `requireCron()` validates CRON_SECRET
- **Fix:** Add webhook signature verification for ML notifications

## Low

### TD-010: Legacy `sidebar-nav.tsx` removed but `user-display.tsx` and `logout-button.tsx` remain unused

- These components were replaced by `user-menu.tsx` in the Topbar
- **Fix:** Delete them once confirmed no page imports them directly

### TD-011: `images.unoptimized: true` in next.config

- All images bypass Next.js Image Optimization
- **Fix:** Enable optimization and use `<Image>` component for product images
- **Priority:** Low — affects performance but not correctness

### TD-012: Package name was `my-v0-project`

- **Status:** Fixed (renamed to `nexo-commerce`)
- **Remaining:** Some internal logs or comments may still reference "v0"

---

## Resolved

| ID | Description | Resolved in |
|----|-------------|-------------|
| - | `generator: "v0.app"` in metadata | UI shell refactor |
| - | `MigrationProvider` dead code | UI shell refactor |
| - | Sidebar monolith (300 lines) | UI shell refactor — extracted to data-driven |
| - | No `ThemeProvider` wired | UI shell refactor |
| - | `[v0]` in console.error (critical routes) | Hardening round 3 |
| - | Missing `.env.example` | Hardening round 2 |
| - | `package.json` name `my-v0-project` | Hardening round 2 |
| - | No `engines` constraint | Hardening round 2 |
| - | No explicit `ignoreBuildErrors: false` | Hardening round 2 |
| - | Middleware duplicate path checks | Hardening round 2 |
| - | No engineering standards doc | Hardening round 2 |
| - | Dashboard page monolith | Hardening round 2 — extracted to 5 components |
| - | Stale PLAN.md in repo root | Hardening round 2 |
| - | Dashboard client-side fetching | Hardening round 3 — converted to server component |
| - | No CI quality gates | Hardening round 3 — CI workflow with build gate |
| - | No structured logging in cron/batch routes | Hardening round 3 — integrated `createStructuredLogger` |
| - | No Zod validation in cron/webhook routes | Hardening round 3 — schemas + validation helpers |
