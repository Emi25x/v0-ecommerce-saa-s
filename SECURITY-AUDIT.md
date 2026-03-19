# Security Audit — v0-ecommerce-saas

**Fecha:** 2026-03-19
**Scope:** middleware, auth, route handlers, cron jobs, service role, validación, secretos

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Total API routes | 347 |
| Routes con `protectAPI()`/`protectCron()` explícito | **8 (2.3%)** |
| Routes que usan `createAdminClient()` (service role) | **107 (30.8%)** |
| Routes sin auth guard explícito | **~232 (66.9%)** |
| Routes con validación Zod | **0** |
| Rutas públicas en middleware (sin sesión) | 6 patrones (~40+ endpoints) |

---

## 1. Hallazgos críticos

### 1.1 CRÍTICO — Cron routes sin autenticación

Las siguientes rutas están excluidas del middleware (`/api/cron/*`) y **no validan** `CRON_SECRET`:

| Ruta | Método | Riesgo |
|------|--------|--------|
| `/api/cron/ml-matcher-tick` | POST | Usa `createAdminClient()` — cualquiera puede ejecutar matching ML |
| `/api/cron/ml-import-tick` | POST | Inicia imports sin auth |
| `/api/cron/ml-import-worker` | GET | Worker sin auth |
| `/api/cron/reprice` | GET | Repricing usa service role directamente |
| `/api/cron/resume-imports` | POST | Reanuda imports sin auth |
| `/api/cron/daily-sales-report` | GET | Report sin auth |
| `/api/cron/auto-sync-all-accounts` | **POST** | GET valida secret, POST no — inconsistencia peligrosa |

**Impacto:** Cualquier actor puede invocar estos endpoints y ejecutar operaciones destructivas con privilegios de service role.

### 1.2 CRÍTICO — Import routes totalmente abiertos

Excluidos del middleware (`/api/inventory/import/*`, `/api/azeta/*`, `/api/arnoia/*`, `/api/inventory/sources/*`):

| Ruta | Qué hace | Auth |
|------|----------|------|
| `/api/inventory/import/batch` | Upsert masivo de productos | ❌ Ninguna |
| `/api/inventory/import/csv` | Import CSV genérico | ❌ Ninguna |
| `/api/inventory/import/start` | Inicia import en background | ❌ Ninguna |
| `/api/inventory/import/cancel` | Cancela import | ❌ Ninguna |
| `/api/inventory/import/stock-price-ean` | Actualiza stock/precio | ❌ Ninguna |
| `/api/arnoia/import-stock` | Import stock Arnoia | ❌ Ninguna |
| `/api/azeta/import-catalog` | Import catálogo Azeta | ❌ Ninguna |
| `/api/azeta/diagnose` | Debug Azeta | ❌ Ninguna |
| `/api/inventory/sources` | Lista import sources | ❌ Ninguna |
| `/api/inventory/sources/[id]/schedule` | Edita schedule | ❌ Ninguna |

**Impacto:** Cualquier persona puede poblar, sobrescribir o limpiar toda la base de productos.

### 1.3 ALTO — Webhook ML sin verificación de firma

`/api/webhooks/ml-notifications` acepta POSTs sin verificar firma HMAC de Mercado Libre. Un atacante puede falsificar notificaciones para manipular datos de productos, stock y publicaciones.

### 1.4 ALTO — 107 routes usan service role, solo 8 tienen auth guard explícito

El 99% de las rutas que usan `createAdminClient()` confían exclusivamente en el middleware para auth. Si se agrega un pattern al middleware bypass (como se hizo con `/api/inventory/sources/*`), esas rutas quedan abiertas con privilegios de service role.

**Principio violado:** Defense in depth — cada route handler debería validar auth independientemente del middleware.

### 1.5 ALTO — CRON_SECRET validation inconsistente

Existen **4 patrones diferentes** de validación:

```
Patrón A: protectCron(request)                          → 8 routes (correcto)
Patrón B: validateCronSecret(request)                   → 5 routes (solo Bearer)
Patrón C: if (CRON_SECRET && authHeader !== Bearer...)   → 5 routes (skip si no hay secret)
Patrón D: sin validación                                 → 7 routes (abierto)
```

El Patrón C es particularmente peligroso: si `CRON_SECRET` no está seteado, la ruta es pública.

### 1.6 MEDIO — 0 routes usan Zod para validación de input

Todos los 288 `request.json()` se destructuran directamente sin validación de schema. Riesgo de tipos inesperados, campos faltantes causando excepciones no controladas, y payloads oversized.

### 1.7 MEDIO — Blob upload sin validación

`/api/blob-upload` acepta cualquier archivo sin validar tipo, tamaño ni sanitizar filename.

### 1.8 BAJO — Comparación de secretos no timing-safe

`validateCronSecret()` y `protectCron()` usan `===` para comparar secretos. Vulnerable a timing attacks (teórico en la práctica, pero best practice es usar timing-safe comparison).

---

## 2. Política de seguridad objetivo

### 2.1 Clasificación de rutas

| Tier | Descripción | Auth requerida | Ejemplo |
|------|-------------|----------------|---------|
| **PUBLIC** | Sin auth, acceso libre | Ninguna | `/login`, `/auth/*`, assets |
| **USER** | Requiere sesión Supabase activa | `requireUser()` | Todas las rutas de app y API de negocio |
| **CRON** | Servicio interno o UI autenticada | `requireCron()` | `/api/cron/*`, `/api/arnoia/*`, `/api/azeta/*` |
| **ADMIN** | Solo admin (futuro) | `requireAdmin()` | `/api/admin/*`, migraciones |

### 2.2 Reglas

1. **Toda ruta con `createAdminClient()` DEBE tener auth guard explícito** — no depender solo del middleware.
2. **Toda ruta excluida del middleware DEBE validar `CRON_SECRET`** via `requireCron()`.
3. **Todo `request.json()` DEBE pasar por un schema Zod** antes de ser usado.
4. **Todo webhook externo DEBE verificar firma** (HMAC/shared secret).
5. **`createAdminClient()` solo permitido en rutas CRON/ADMIN** — rutas USER deben usar `createClient()` (sesión).
6. **Responses de error deben ser uniformes** — nunca exponer stack traces o detalles internos.
7. **Secretos nunca en logs** — usar `[REDACTED]` para tokens/keys.

### 2.3 Convención de route handler estándar

```typescript
// app/api/example/route.ts
import { NextRequest } from "next/server"
import { requireUser } from "@/lib/auth/require-auth"
import { apiOk, apiError } from "@/lib/api/response"
import { z } from "zod"

const BodySchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive().max(99999),
})

export async function POST(request: NextRequest) {
  // 1. Auth
  const auth = await requireUser()
  if (auth.error) return auth.response

  // 2. Validate input
  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues, 400)
  }

  // 3. Business logic (con supabase de sesión, no admin)
  const supabase = auth.supabase
  const { data, error } = await supabase
    .from("products")
    .update({ stock: parsed.data.quantity })
    .eq("id", parsed.data.product_id)
    .select()
    .single()

  if (error) return apiError("db_error", error.message, 500)

  // 4. Return
  return apiOk(data)
}
```

---

## 3. Helpers reutilizables propuestos

### `lib/auth/require-auth.ts`

```typescript
requireUser()    → { error, response, user, supabase }
requireCron(req) → { error, response, via }
requireAdmin()   → { error, response, user }  // futuro
```

### `lib/api/response.ts`

```typescript
apiOk(data, status?)           → NextResponse.json({ ok: true, data }, { status })
apiError(code, detail, status) → NextResponse.json({ ok: false, error: { code, detail } }, { status })
```

### `lib/validation/parse-body.ts`

```typescript
parseBody(request, schema)     → { ok, data } | { ok: false, response: NextResponse }
parseQuery(request, schema)    → { ok, data } | { ok: false, response: NextResponse }
```

---

## 4. Riesgos operacionales

### 4.1 Rate limiting

**Estado actual:** Sin rate limiting en ninguna ruta.

**Riesgo:** Import endpoints pueden ser llamados en loop, agotando CPU del serverless function y créditos de Supabase.

**Propuesta:** Rate limit en middleware o via Vercel WAF:
- `/api/cron/*` → 1 req/min por endpoint
- `/api/inventory/import/*` → 5 req/min
- `/api/*/` genérico → 60 req/min por IP

### 4.2 Idempotencia / doble ejecución

**Riesgo real:** Cron jobs sin idempotencia:
- `sync-ml-stock` y `sync-ml-orders` pueden correr en paralelo si Vercel invoca antes de que termine el anterior
- `import-schedules` puede disparar imports superpuestos
- `reprice` puede aplicar repricing doble

**Propuesta:**
- Usar `process_runs` como lock: antes de ejecutar, verificar que no hay un run `status=running` reciente
- Agregar `idempotency_key` basado en timestamp (hora truncada) para cron jobs

### 4.3 Reentrancy

**Riesgo:** Webhooks ML pueden disparar procesamiento que a su vez hace llamadas a ML API, que genera más webhooks.

**Propuesta:** Flag `processing` en `ml_publications` para evitar loops.

---

## 5. Plan de migración por prioridad

### Fase 0 — Hoy (crítico, sin romper nada)

1. Crear `lib/auth/require-auth.ts` — nuevos guards que wrappean los existentes
2. Crear `lib/api/response.ts` — response helpers
3. Hardening de las 7 cron routes sin auth → agregar `requireCron()`
4. Hardening de `/api/cron/auto-sync-all-accounts` POST → agregar auth
5. Commit y deploy

### Fase 1 — Esta semana (alto)

6. Agregar `requireCron()` a todas las import routes (`/api/arnoia/*`, `/api/azeta/*`, `/api/inventory/import/*`)
7. Agregar `requireUser()` a las rutas con `createAdminClient()` que no están en el middleware bypass
8. Agregar validación Zod a las 10 rutas más críticas (billing, imports, shopify push)
9. Verificar firma HMAC en webhook ML

### Fase 2 — Próximas 2 semanas (medio)

10. Migrar rutas restantes a `requireUser()` explícito
11. Agregar Zod schemas a todas las rutas POST/PUT/PATCH
12. Agregar rate limiting básico (Vercel WAF o middleware)
13. Audit trail para operaciones admin via `process_runs`

### Fase 3 — Mes siguiente (mejora continua)

14. Implementar RBAC si se necesitan roles (admin, operator, viewer)
15. Centralizar env vars con validación al startup
16. Agregar health checks y alertas para auth failures
17. Timing-safe secret comparison
18. Webhook signature verification para Shopify
