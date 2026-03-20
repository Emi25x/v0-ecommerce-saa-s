# Engineering Standards

Standards and guardrails for the Nexo Commerce codebase. These apply to all contributors and automated agents.

## CI / Quality Gates

Every PR and push to `main` runs the CI pipeline (`.github/workflows/ci.yml`):

| Step | Command | Fails on |
|------|---------|----------|
| Typecheck | `pnpm typecheck` | Any TS error |
| Lint | `pnpm lint` | Any warning (`--max-warnings 0`) |
| Format | `pnpm format:check` | Unformatted files |
| Test | `pnpm test` | Any failing test |
| Build | `pnpm build` | Build errors (runs after quality gates pass) |

**Do not merge PRs that fail CI.** Fix the issue, don't skip the check.

## Build safety

| Setting | Value | Why |
|---------|-------|-----|
| `typescript.ignoreBuildErrors` | `false` | A build that ignores TS errors deploys broken code |
| `eslint.ignoreDuringBuilds` | `false` | Lint errors in production = bugs |
| `tsconfig.strict` | `true` | Catches null/undefined errors at compile time |
| `tsconfig.allowJs` | `false` | All code must be TypeScript |
| `tsconfig.skipLibCheck` | `true` | Required — third-party libs have React 19 type issues |

These are enforced in `next.config.mjs` and `tsconfig.json`. Do not change them without ADR.

## TypeScript

- **No `any` in new code.** Existing `any` is tracked (eslint warns, ~200 instances). New code must use proper types.
- **No `// @ts-ignore` or `// @ts-expect-error`** without an adjacent comment explaining why.
- **Prefer `unknown` over `any`** for truly unknown data (API responses, user input).
- **No type assertions (`as X`)** unless the alternative is worse. Prefer type guards.

### Future: `noUncheckedIndexedAccess`

`tsconfig.json` has this commented out. It catches `array[i]` returning `T | undefined`. Plan to enable it after fixing ~100 existing errors. See `docs/TECH_DEBT.md` TD-002 for the incremental strategy.

## API Routes

### Pattern

```typescript
// app/api/{domain}/{action}/route.ts
import { NextRequest } from "next/server"
import { parseBody } from "@/lib/validation/parse-body"
import { MySchema } from "@/lib/validation/schemas"
import { createStructuredLogger, genRequestId } from "@/lib/logger"
import { handleRouteError } from "@/lib/errors/handle-route-error"
import { apiOk } from "@/lib/api/response"

export async function POST(request: NextRequest) {
  const log = createStructuredLogger({ request_id: genRequestId() })
  try {
    const parsed = await parseBody(request, MySchema)
    if (!parsed.ok) return parsed.response

    const result = await doWork(parsed.data)
    log.info("Work done", "my.operation", { status: "ok" })
    return apiOk(result)
  } catch (err) {
    log.error("Request failed", err, "my.operation")
    return handleRouteError(err)
  }
}
```

### Rules

1. **Thin route handlers.** The `route.ts` should parse input, call domain logic, return response. No business logic in route files.
2. **Service role for server operations.** Use `createAdminClient()` for operations that don't need user context.
3. **Session-aware for user operations.** Use `createClient()` (from `lib/db/server.ts`) when RLS should apply.
4. **Always return JSON errors** — use `handleRouteError()` or `apiError()`. Never throw unhandled exceptions.
5. **`maxDuration`** — set explicitly for long-running operations (max 300s on Vercel Pro).
6. **Validate inputs with Zod** — use `parseBody()` / `parseQuery()` from `lib/validation/parse-body.ts`. Schemas live in `lib/validation/schemas.ts`.
7. **Structured logging** — use `createStructuredLogger()` for all new routes. Never log tokens, passwords, or PII.

### Error response shape

All errors must follow this shape:

```json
{ "ok": false, "error": { "code": "validation_error", "detail": "..." } }
```

Use helpers from `lib/api/response.ts`: `apiError()`, `apiBadRequest()`, `apiNotFound()`, `apiValidation()`, `apiInternal()`.

### File size

If a route handler exceeds ~100 lines, extract business logic to `domains/` or `lib/`. The route file should be a thin adapter.

## Observability

### Structured logging

Use `createStructuredLogger()` from `lib/logger.ts`. Every log line is a JSON object with:

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 |
| `level` | info, warn, error |
| `message` | Human-readable description |
| `operation` | What is being done (e.g., `ml.scan`, `batch.upsert`) |
| `request_id` | Unique per HTTP request (from `genRequestId()`) |
| `run_id` | Unique per import run (from `process_runs.id`) |
| `account_id` | ML account being processed |
| `duration_ms` | How long the operation took |
| `status` | ok, error, rate_limited, partial, timeout |
| `error_code` | Machine-readable error code |

Use `log.timed()` for automatic duration tracking. Use `log.child()` to add context.

### process_runs

Every batch/sync/import process creates a record in `process_runs`:

```sql
SELECT process_type, status, duration_ms, rows_processed, rows_failed, error_message
FROM process_runs
ORDER BY started_at DESC
LIMIT 20;
```

### Debug endpoints

| Endpoint | What it shows |
|----------|--------------|
| `GET /api/ops/status` | System stats, provider health, ML stats |
| `GET /api/ops/recent-runs` | Last 10 process runs |
| `GET /api/inventory/stock-overview` | Stock by source breakdown |
| `GET /api/shopify/stores/[id]/analyze` | Shopify store reverse-analysis |

## Components

### File structure

- One exported component per file
- File name = kebab-case (`page-header.tsx`)
- Component name = PascalCase (`PageHeader`)
- Co-located sub-components (used only by parent) are OK as non-exported functions in the same file

### Styling

- Use Tailwind CSS tokens: `bg-background`, `text-foreground`, `border-border`
- **Never** use `bg-white`, `text-black`, `bg-gray-*` — breaks dark mode
- Use `PageHeader` component for page headers — don't re-invent
- Card-based layout for data sections

### Data fetching

Prefer this order:
1. **Server Component** with `async` data fetch (best for SEO, performance)
2. **SWR hook** for client-side data that needs revalidation
3. **`useEffect` + `fetch`** only as last resort (complex interaction patterns)

## Database

- **Migrations** go in `supabase/migrations/` with format `YYYYMMDD_description.sql`
- **Never modify `products.stock` directly** — only update `stock_by_source`, the trigger handles the rest
- **Batch operations** use RPCs, not row-by-row inserts
- **All batch processes** must use `startRun()` / `run.complete()` / `run.fail()` from `lib/process-runs.ts`

## Security

### Middleware policy

See `middleware.ts` for the full policy. Summary:

| Route pattern | Auth required | Reason |
|--------------|---------------|--------|
| `/login`, `/auth/*` | No | Public auth flows |
| `/api/cron/*` | `requireCron()` | CRON_SECRET or user session |
| `/api/azeta/*`, `/api/arnoia/*` | `requireCron()` | Supplier import endpoints |
| `/api/inventory/import/*` | `requireCron()` | Background import workers |
| `/api/shopify/oauth/callback` | No | OAuth callback |
| `/api/webhooks/*` | No | External webhooks (ML notifications) |
| Everything else | Yes | Supabase session required |

### Credentials

- Supabase keys and ML secrets → env vars (`.env.local`, Vercel dashboard)
- Supplier/carrier/Shopify credentials → DB (JSONB columns with RLS)
- **Never commit** `.env.local` or credentials
- **Never log** access tokens, refresh tokens, or passwords
