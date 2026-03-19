# Arquitectura — Nexo Commerce

## Vista general

```
                    ┌──────────────────┐
                    │     Vercel       │
                    │   (Next.js 15)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
         │ App     │   │ API     │   │ Cron    │
         │ Router  │   │ Routes  │   │ Jobs    │
         │ (SSR)   │   │ (Edge/  │   │ (Vercel │
         │         │   │ Node)   │   │ Cron)   │
         └────┬────┘   └────┬────┘   └────┬────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼─────────┐
                    │    Supabase      │
                    │  (PostgreSQL)    │
                    │  + Auth + RLS    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
         │ Mercado │   │ Shopify │   │ Carriers│
         │ Libre   │   │ (multi- │   │ (Cabify │
         │ (OAuth) │   │ store)  │   │ FastMail│
         └─────────┘   └─────────┘   └─────────┘
```

## Capas de la aplicación

### 1. Presentación (App Router)

```
app/
├── layout.tsx              # Root: ThemeProvider + Toaster
├── (auth)/layout.tsx       # Auth: centrado, sin sidebar
└── (dashboard)/layout.tsx  # Dashboard: sidebar + topbar + main
```

- **Route Groups**: `(auth)` para login, `(dashboard)` para todo lo autenticado
- **Middleware** (`middleware.ts`): protege rutas, valida sesión Supabase
- **Shell**: Sidebar (data-driven via `lib/navigation.tsx`) + Topbar (breadcrumb + user menu)
- **Componentes UI**: shadcn/ui (Radix + Tailwind) con tema dark por defecto

### 2. API Routes

Todas las API routes viven en `app/api/` como `route.ts`.

**Patrón estándar:**

```typescript
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET() {
  const supabase = createAdminClient()
  try {
    const { data, error } = await supabase.from("table").select("*")
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

**Clientes Supabase:**

| Client | Archivo | Uso |
|--------|---------|-----|
| `createClient()` | `lib/db/client.ts` | Browser (client components) |
| `createClient()` | `lib/db/server.ts` | Server Components, API routes con sesión |
| `createAdminClient()` | `lib/db/admin.ts` | API routes server-side (service role, bypasa RLS) |
| `updateSession()` | `lib/db/proxy.ts` | Middleware (valida/renueva sesión) |

### 3. Base de datos (Supabase / PostgreSQL)

#### Tablas principales

```
products                    # Catálogo unificado
├── ean (unique)
├── stock_by_source (JSONB) # {"arnoia": 45, "azeta": 0}
├── stock (int)             # Calculado por trigger
└── custom_fields (JSONB)

import_sources              # Configuración de proveedores
├── source_key              # "arnoia", "azeta", "libral"
├── credentials (JSONB)
└── url_template

ml_accounts                 # Cuentas MercadoLibre (OAuth)
shopify_stores              # Tiendas Shopify (multi-store)
shopify_product_links       # Vinculación producto ↔ variante Shopify
carriers                    # Transportistas (config + credentials JSONB)
shipments                   # Envíos con tracking
process_runs                # Audit trail de procesos batch
```

#### Trigger de stock

```sql
TRIGGER trigger_sync_stock_total
  BEFORE INSERT OR UPDATE OF stock_by_source
  ON products
  → sync_stock_total()
  → NEW.stock = SUM(stock_by_source values)
```

**Regla clave:** solo actualizar `stock_by_source` — el campo `stock` se recalcula automáticamente.

#### RPCs de batch

| Función | Uso |
|---------|-----|
| `bulk_update_stock_price(eans, stocks, prices, source_key)` | Arnoia stock diario |
| `bulk_update_azeta_stock(eans, stocks)` | Azeta stock |
| `bulk_update_stock_two_prices(eans, stocks, prices_eur, prices_ars)` | Libral (dual-currency) |
| `run_shopify_matching_v2(store_id)` | Matching SKU productos ↔ Shopify |

### 4. Integraciones externas

#### Mercado Libre

```
OAuth 2.0 PKCE
├── Auth:     /api/mercadolibre/auth → redirect a ML
├── Callback: /api/mercadolibre/callback → guarda tokens en ml_accounts
├── Refresh:  /api/mercadolibre/refresh-token → auto-refresh
└── Webhooks: /api/webhooks/ml-notifications → procesa notificaciones ML
```

- Soporte multi-cuenta
- Sincronización bidireccional de stock, órdenes, envíos
- Import masivo de publicaciones con matcher automático

#### Shopify

```
Multi-store (shopify_stores)
├── Auth:     Access Token directo o Client Credentials (OAuth)
├── Auto-renew: getValidToken() renueva si token_expires_at pasó
├── GraphQL:  Productos, variantes, inventario, metafields
└── Aislamiento: todo filtrado por store_id
```

- Cada tienda tiene su configuración, templates, mappings
- Export masivo con 78 columnas canónicas + 22 metafields
- Template builder con ingeniería inversa de productos existentes

#### Transportistas

```
carriers (tabla)
├── cabify  → lib/carriers/cabify.ts   (OAuth 2.0, cotización, etiquetas)
└── fastmail → lib/carriers/fastmail.ts (API v1+v2, POST con api_token)
```

### 5. Flujo de datos

#### Stock (fuente → producto → canal)

```
Proveedor (Arnoia/Libral)
  ↓ CSV download
  ↓ Parse + batch
  ↓ RPC bulk_update_stock_price
  ↓
products.stock_by_source = {"arnoia": N}
  ↓ TRIGGER sync_stock_total
products.stock = SUM(stock_by_source.*)
  ↓
Sync → ML (stock endpoint)
Sync → Shopify (inventory levels API)
```

#### Pedidos (canal → DB → fulfillment)

```
ML/Shopify webhook/cron
  ↓
orders (tabla) / ML API direct
  ↓
Procesamiento → shipments → carrier API → tracking
  ↓
Facturación → billing
```

### 6. Audit trail

Todos los procesos batch usan `process_runs`:

```typescript
import { startRun } from "@/lib/process-runs"

const run = await startRun(supabase, "arnoia_stock", "Arnoia Stock Diario")
try {
  // ... trabajo ...
  await run.complete({ rows_processed: 5000, rows_updated: 4800 })
} catch (err) {
  await run.fail(err)
}
```

Si la tabla no existe, `startRun` retorna un no-op handle (degradación graceful).

### 7. Cron jobs

Definidos en `vercel.json`, ejecutan endpoints en `app/api/cron/`:

```
Cada 3 horas  → /api/cron/sync-arnoia-stock    (stock principal)
Cada 2 horas  → /api/cron/process-orders        (procesar órdenes)
Cada hora     → /api/cron/import-schedules       (importaciones programadas)
9:00 AM       → /api/cron/sync-ml-stock          (stock → ML)
9:30 AM       → /api/cron/sync-ml-orders         (órdenes ML)
2:00 AM       → /api/ml/auto-sync-all            (sync completo ML)
Cada 6 horas  → /api/cron/competition-analysis   (análisis de competencia)
```

## Decisiones de diseño

Ver [ADRs](adr/) para el registro formal de decisiones arquitectónicas.

Decisiones clave:

1. **stock_by_source JSONB** en vez de tabla separada de stock — simplifica queries y permite trigger calculado
2. **Multi-store Shopify** con aislamiento por `store_id` — evita colisiones entre tiendas
3. **process_runs** como audit trail genérico — un solo lugar para monitorear todos los procesos
4. **Credenciales en DB** (no en env vars) — permite multi-tenant y configuración dinámica
5. **Sidebar data-driven** (`lib/navigation.tsx`) — una sola fuente de verdad para toda la navegación
