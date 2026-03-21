# CLAUDE.md — Contexto del Proyecto

## ¿Qué es este proyecto?

**SaaS de gestión e-commerce multi-canal** para vendedores argentinos/latinoamericanos.
Centraliza productos, stock, pedidos, envíos y facturación de múltiples canales de venta.

- **Stack:** Next.js 15, React 19, TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS v4
- **UI:** Radix UI, React Hook Form + Zod, SWR para fetching
- **Deploy:** Vercel **Pro** ✅ (confirmado — soporta `maxDuration=300` en serverless functions)

---

## Módulos principales

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Inventario | `/inventory` | Stock multi-fuente, imports CSV/API |
| Pedidos | `/orders` | Órdenes de ML y Shopify |
| Envíos | `/envios` | Transportistas, remitentes, tracking, cotizador |
| Shopify | `/shopify` | Sync productos/pedidos/inventario, publicación masiva, template builder |
| Integraciones ML | `/integrations` | Publicaciones, templates, matcher |
| Facturación | `/billing` | Facturas ML, AFIP, comprobantes |
| Competencia | `/competition` | Análisis de precios, repricing |
| Marketing | `/marketing` | Google, Meta, TikTok, email platforms |
| Atención al cliente | `/atencion` | Inbox unificado ML + Shopify |
| Radar | `/radar` | Monitoreo de mercado |

---

## Integraciones externas

### Marketplaces
- **Mercado Libre** — OAuth 2.0 PKCE, listings, pedidos, facturación
- **Shopify** — Multi-tienda, OAuth + Custom App (API key/secret), GraphQL API (productos, pedidos, inventario)
  - Soporta conexión por Access Token directo (`shpat_...`) o por Client ID + Client Secret
  - Client credentials: requiere que la app esté **INSTALADA** en Shopify Admin antes de conectar
  - Cada tienda tiene nombre personalizado, settings por tienda, template de exportación por tienda

### Fuentes de inventario (proveedores)
- **Azeta** — Catálogo via API (ZIP/CSV ~230MB, ~7800+ productos de libros)
  - **Estado actual: catálogo importa metadata pero NO stock.** El stock vendría de un archivo separado que aún no se logró importar.
  - Campos importados: EAN, título, autor, editorial, PVP, idioma, sinopsis, imagen, año edición
  - Stock inicial al crear producto: `stock_by_source: {azeta: 0}, stock: 0`
- **Arnoia** — Fuente PRINCIPAL de productos y stock ✅ FUNCIONANDO
  - **3 import sources configurados:**
    - **Arnoia Catálogo**: crea todos los productos (upsert via batch import). Se corrió inicialmente para poblar la base.
    - **Arnoia Act**: actualización semanal de productos nuevos (upsert via batch import)
    - **Arnoia Stock**: actualización DIARIA de stock solamente (UPDATE via `bulk_update_stock_price` RPC)
  - Usa `bulk_update_stock_price` RPC con `p_source_key = "arnoia"` (o el `source_key` del import_source)
  - Actualiza `stock_by_source['arnoia']` → trigger recalcula `products.stock`
  - Importa: EAN, stock, precio (precio_sin_iva)
- **Libral ERP** — Distribuidora de libros, dual-currency (EUR + ARS)

### Transportistas (Argentina)
- **Cabify Logistics** — OAuth 2.0, cotización, etiquetas, tracking
  - `lib/carriers/cabify.ts`
  - Base URL: `https://logistics.api.cabify.com` (corregida, la anterior `https://api.cabify.com` era incorrecta)
  - Auth URL: `https://cabify.com/auth/api/authorization`
  - `getShippingTypes()` usa `location=lat,lon` (NO `lat=&lon=` separados — eso da HTTP 400)
  - Conexión verificada ✅ (0 tipos disponibles = cuenta sin servicios activados del lado de Cabify)
- **FastMail** — API v1 y v2, autenticación via `api_token` en body POST
  - `lib/carriers/fastmail.ts`
  - Base URL: `https://epresislv.fastmail.com.ar`
  - Todos los endpoints usan POST con `{ api_token, ...params }` en el body
  - Endpoints v2 implementados: `dummy-test.json`, `cotizador.json`, `guias.json`, `seguimiento.json`, `servicios-cliente.json`, `serviciosByIntegracionPresis.json`, `precio-servicio.json`, `sucursalesByCliente.json`, `solicitarRetiro.json`, `generaRecepcion.json`, `editarSucursal.json`, `localidades.json`, `listarTipoOperacion`, `listarCps`, `consultarStock`, `print-etiquetas-custom`, `etiquetas-cliente`, `integracion.json`
  - Endpoints v1 implementados: `servicios-cp.json` (servicios disponibles por CP destino)
  - Conexión verificada ✅
  - **Flujo de cotización** (`quote()`): 3 intentos en cascada:
    1. `precio-servicio.json` (v2) — un solo llamado, devuelve precios por servicio para el tramo. Requiere `sucursal`.
    2. `servicios-cp.json` (v1) — para facturación "por cordón": filtra servicios que cubren el CP destino, luego cotiza cada uno con `cotizador.json`
    3. Fallback: `servicios-cliente.json` + `cotizador.json` por servicio en paralelo
  - **`precio-servicio.json`**: toma `cp_destino`, `sucursal`, `productos` (con `dimensiones` requeridas)
  - **`servicios-cp.json`** (v1): solo para facturación por cordón. Devuelve `[{ id, cod_serv, descripcion }]` de servicios ecommerce que cubren el CP
  - **`cotizador.json`**: requiere `cp_origen`, `cp_destino`, `codigo_servicio`, `productos`
  - **Guías**: el manual v2 dice `valor_declarado` (snake_case) pero en la práctica funciona `valorDeclarado` (camelCase). Mantener camelCase.
  - **`seguimiento.json`** (v2): confirmado en manual oficial. Parámetros: `remito` (opcional) o `nro_guia` (opcional)
  - `sucursal` en config = código alfanumérico de sucursal del cliente en FastMail

### Marketing (15+ plataformas)
Google Ads/Analytics/Search Console/Merchant, Meta Ads, TikTok Ads, LinkedIn, Pinterest,
Klaviyo, Mailchimp, Brevo, HubSpot, ActiveCampaign, WhatsApp Business

---

## Base de datos (Supabase)

### Tablas clave
- `products` — catálogo unificado (ean, sku, title, price, cost_price, stock, stock_by_source JSONB)
  - Columnas extendidas: author, language, year_edition, isbn, binding, pages, edition_date, ibic_subjects, subject, course, height, width, thickness, pvp_editorial, cost_price
  - `stock_by_source` JSONB: `{"arnoia": 45, "azeta": 0}` — stock desglosado por proveedor
  - `stock` integer: calculado automáticamente como SUM de stock_by_source via trigger
  - `custom_fields` JSONB: campos extra que no tienen columna dedicada
- `import_sources` — config de fuentes de datos (Azeta, Arnoia, Libral con credentials JSONB, source_key)
- `ml_accounts` — cuentas de Mercado Libre (tokens OAuth)
- `shopify_stores` — tiendas Shopify (multi-store, con name, api_key, api_secret, token_expires_at, vendor, product_category, price_source, etc.)
- `shopify_product_links` — vinculación producto↔variante Shopify por tienda. UNIQUE(product_id, store_id, shopify_variant_id)
- `shopify_variants_cache` — caché de variantes para matching. UNIQUE(store_id, shopify_variant_id)
- `shopify_export_templates` — template de exportación por tienda. UNIQUE(shopify_store_id). Columnas: template_columns_json, defaults_json
- `shopify_location_mappings` — mapeo almacén → Shopify location por tienda. UNIQUE(store_id, warehouse_id)
- `carriers` — transportistas (slug, config JSONB, credentials JSONB)
- `shipments` — envíos (tracking_number, status, carrier_slug, external_id)
- `remitentes` — direcciones de origen para envíos (ABM en `/envios/remitentes`)
- `marketing_connections` — tokens de plataformas de marketing
- `repricing_rules` — reglas de repricing automático
- `cs_conversations` — conversaciones de atención al cliente (ML, Shopify, WhatsApp)
- `cs_messages` — mensajes individuales por conversación
- `cs_response_templates` — plantillas de respuesta rápida
- `process_runs` — audit trail unificado de todos los procesos batch/sync/import. Columnas: process_type, process_name, status (running|completed|failed), started_at, finished_at, duration_ms, rows_processed, rows_created, rows_updated, rows_failed, error_message, log_json (JSONB)

### Funciones PL/pgSQL
- `bulk_update_azeta_stock(p_eans text[], p_stocks int[])` — actualiza `stock_by_source['azeta']` via JSONB merge. Trigger recalcula stock total.
- `zero_azeta_stock_not_in_list(p_eans text[])` — pone `stock_by_source['azeta']=0` en productos no presentes en el archivo
- `bulk_update_stock_price(p_eans text[], p_stocks int[], p_prices numeric[], p_source_key text)` — actualiza stock_by_source[source_key] + precio. Usado por Arnoia.
- `bulk_update_stock_two_prices(ean[], stock[], price_eur[], price_ars[])` — multi-moneda (Libral)
- `sync_stock_total()` — trigger BEFORE INSERT/UPDATE OF stock_by_source que recalcula `stock = SUM(stock_by_source.*)`
- `calculate_stock_total(stock_sources JSONB)` — función auxiliar usada por el trigger
- `run_shopify_matching_v2(p_store_id uuid)` — matching SKU-based entre productos y variantes Shopify

### Trigger de stock
```
TRIGGER trigger_sync_stock_total
  BEFORE INSERT OR UPDATE OF stock_by_source
  ON products
  → sync_stock_total() → NEW.stock = SUM(stock_by_source values)
```
Esto significa que SOLO hay que actualizar `stock_by_source` — el campo `stock` se recalcula automáticamente.

### Migraciones
En `supabase/migrations/` y `scripts/`. Los archivos SQL se aplican manualmente o vía Supabase CLI.
- `20260315_fix_bulk_update_azeta_stock.sql` — RPC functions para JSONB stock merge
- `20260316_add_missing_product_columns.sql` — agrega columnas faltantes a products y shopify_stores
- `034_add_stock_by_source_jsonb.sql` — trigger de stock + función calculate_stock_total
- `052_create_process_runs.sql` — tabla `process_runs` para audit trail unificado de procesos

---

## Variables de entorno necesarias

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Mercado Libre
MERCADOLIBRE_CLIENT_ID=
MERCADOLIBRE_CLIENT_SECRET=

# Shopify (por tienda, se guardan en DB — NO en env)
# SHOPIFY_STORE_DOMAIN= (legacy, no usar)
# SHOPIFY_ACCESS_TOKEN= (legacy, no usar)

# OpenAI (opcional)
OPENAI_API_KEY=

# Vercel (auto-detectado)
VERCEL_URL=
NEXT_PUBLIC_APP_URL=
```

Las credenciales de proveedores (Azeta, Arnoia, Libral) y transportistas (Cabify, FastMail)
se guardan en columnas JSONB en la base de datos, no en variables de entorno.

---

## Patrones y convenciones

### API Routes
- Todas en `app/api/` como `route.ts`
- Usan `createAdminClient()` (service role) para operaciones server-side
- Usan `createClient()` (sesión de usuario) para operaciones que requieren autenticación
- Patrón: `try/catch` + `NextResponse.json()`
- Patrón resiliente: intentar SELECT con todas las columnas, si falla por columna inexistente → fallback a columnas seguras

### Namespace de API — Mercado Libre
- **Namespace oficial: `/api/ml/`** — todo código nuevo debe usar este namespace
- **`/api/mercadolibre/`** — legacy, se mantiene funcional por compatibilidad:
  - **Obligatorio mantener:** `auth`, `callback`, `webhooks/*` (URLs registradas en ML como callback externo)
  - **Deprecado con re-export:** `products` → re-exporta desde `/api/ml/items`
  - **Deprecado, migración futura:** `accounts` (tiene auto-refresh de tokens + DELETE), `catalog-optin`, `products/sync-stock`
  - **Único en mercadolibre (sin equivalente en ml):** `shipments/*`, `payments`, `claims`, `returns/*`, `ads/*`, `generate-link`, `status`
- **Regla:** Nunca crear endpoints NUEVOS en `/api/mercadolibre/`. Usar `/api/ml/` para nuevas funcionalidades.

### Autenticación
- Middleware en `middleware.ts` protege todas las rutas
- Rutas públicas: `/login`, `/auth/*`, `/api/cron/*`, `/api/arnoia/*`, `/api/inventory/import/*`, `/api/shopify/oauth/callback`

### Nomenclatura
- Tablas DB: snake_case en español (e.g., `remitentes`, `transportistas`)
- Código JS/TS: camelCase
- Slugs de carriers: `"cabify"`, `"fastmail"`
- Slugs de fuentes: `"azeta"`, `"arnoia"`, `"libral"`
- source_key en import_sources: lowercase string (e.g., "arnoia") — usado como clave en stock_by_source JSONB

### Flujo de stock
```
Arnoia (fuente principal ✅) / Libral (secundaria)
  → import_sources (URL + credentials + source_key)
  → Catálogo/Act: upsert via batch import (crea productos)
  → Stock diario: RPC bulk_update_stock_price(eans, stocks, prices, source_key)
  → UPDATE products SET stock_by_source = stock_by_source || {source_key: qty}
  → TRIGGER sync_stock_total() recalcula products.stock = SUM(stock_by_source.*)
```

### Flujo de datos general
```
Proveedores (Arnoia principal / Libral secundario)
  → import_sources → products (stock_by_source JSONB)
  → Sync/Push a ML / Shopify

Pedidos ML/Shopify → DB → facturación/envíos
Envíos → carrier API → tracking updates en shipments
```

---

## Shopify — Multi-tienda

### Conexión de tiendas (`/integrations/shopify-stores`)
- Soporta múltiples tiendas Shopify simultáneamente
- Cada tienda con nombre personalizado (campo `name` en `shopify_stores`)
- Autenticación: Access Token directo (`shpat_...`) o Client ID + Client Secret (OAuth client_credentials)
- **Client credentials requiere app INSTALADA** en Shopify Admin → Apps → Develop apps → Install
- Auto-renovación de token: `getValidToken()` en `lib/shopify-auth.ts` renueva si `token_expires_at` pasó
- `lib/shopify-auth.ts`: funciones compartidas (normalizeDomain, exchangeCredentialsForToken, fetchShopInfo, renewAndPersistToken, getValidToken)

### Sync de productos
- Aislamiento total por tienda: `shopify_product_links` tiene clave compuesta `(product_id, store_id, shopify_variant_id)`
- `shopify_variants_cache` se limpia por `store_id` antes de cada sync
- Matching SQL filtra `WHERE v.store_id = p_store_id`
- **Productos de diferentes tiendas NO se mezclan ni sobreescriben**

### Publicación masiva (`/shopify/config`)
- Selección de tienda → configuración por tienda → agregar productos por EAN → push directo o export XLSX
- Settings por tienda: Vendor, Product Category, Price Source, Warehouse, Sucursal Stock Code
- Push directo: `POST /api/shopify/push-product` (crea/actualiza producto con 22+ metafields + stock por location)
- Export XLSX: `POST /api/shopify/export-generate` (genera 78 columnas canónicas Shopify)

### Template Builder (ingeniería inversa)
- **Endpoint de análisis**: `GET /api/shopify/stores/[id]/analyze` — baja productos existentes de Shopify con metafields via GraphQL
  - Detecta metafields usados (namespace.key, tipo, % de uso, valores ejemplo)
  - Auto-sugiere mapeo a columnas de la DB (METAFIELD_TO_DB mapping)
  - Lista vendors, tipos y tags únicos
  - Productos de ejemplo para preview
- **UI**: Sección "Template de Exportación" en `/shopify/config`
  - Botón "Analizar Tienda" corre el análisis inverso
  - Tabla de metafields detectados con mapeo automático
  - Editor de defaults (Vendor, Type, Product Category, etc.)
  - Guardar/cargar template por tienda via `POST /api/shopify/export-templates`
- **Templates**: `shopify_export_templates` (1:1 con tienda)
  - `template_columns_json` — subset de columnas a exportar (vacío = todas las 78)
  - `defaults_json` — valores por defecto para campos como Vendor, Type, Status

---

## Ramas activas relevantes

- `main` — producción
- `claude/fix-import-failures-NHH6P` — rama de desarrollo activa (incluye: fix imports, multi-store Shopify, template builder, OAuth fixes)
- `claude/fix-supplier-imports-R0q3s` — fixes en imports de suppliers y cliente FastMail (mergeado a NHH6P)
- `claude/fix-billing-dni-R0q3s` — fixes en facturación/DNI

---

## Módulo de Atención al Cliente (`/atencion`)

### Páginas
- `/atencion/inbox` — inbox unificado multi-canal
- `/atencion/ml-preguntas` — preguntas ML con selector de cuenta (todas / cuenta específica)
- `/atencion/config` — plantillas de respuesta y configuración de canales

### API routes (`/api/cs/`)
- `GET /api/cs/conversations` — lista conversaciones. Soporta filtros: `channel`, `status`, `q`, `ml_account_id`
- `GET /api/cs/ml-questions?sync=1&account_id=...` — sincroniza preguntas desde ML API
- `POST /api/cs/conversations/[id]/reply` — responde una pregunta (postea a ML y guarda localmente)
- `/api/cs/templates` — CRUD de plantillas

### Flujo de sync ML
1. Usuario hace click en "Sincronizar" → `GET /api/cs/ml-questions?sync=1[&account_id=...]`
2. API itera sobre cuentas ML del usuario, refresca tokens y llama `questions/search?seller_id=...&status=UNANSWERED`
3. Hace upsert en `cs_conversations` + `cs_messages`
4. La UI recarga desde `/api/cs/conversations?channel=ml_question`

### Para listar cuentas ML disponibles
`GET /api/mercadolibre/accounts` — devuelve `{ accounts: [{ id, nickname, ... }] }`

---

## Importación Azeta

### Estado actual: ❌ NUNCA se usó para importar
- Azeta nunca se logró hacer funcionar para importar productos
- **Todos los productos en la base vienen de ARNOIA** (Catálogo + Act + Stock)
- El código de import Azeta existe pero no se usó en producción
- Si se quisiera activar en el futuro: el catálogo no incluye stock, necesitaría fuente separada

### Arquitectura
- `lib/azeta/run-catalog-import.ts` — lógica central, llamada por cron y por UI
- `lib/azeta/update-stock-import.ts` — actualización de stock separada (necesita fuente configurada)
- `app/api/azeta/import-catalog/route.ts` — endpoint cron + UI (maxDuration=300)
- `app/api/azeta/import-stock/route.ts` — actualización de stock (sin catálogo)
- `app/api/azeta/download/route.ts` + `app/api/azeta/process/route.ts` — **deprecados**, no usar.

### Flujo de importación (Azeta Total)
1. UI llama `POST /api/azeta/import-catalog` con `{ source_id }`
2. `runCatalogImport()` resuelve URL desde `import_sources` (fallback: URL hardcodeada)
3. Descarga ZIP (~230MB) via `fetch()` con streaming ReadableStream
4. Detecta formato en primer chunk (magic bytes `PK` = ZIP, sino CSV)
5. ZIP: descomprime con `fflate` streaming (`Unzip` + `UnzipInflate`) sin cargar el archivo completo en RAM
6. CSV: procesa stream directamente con `TextDecoder("latin1")` incremental
7. Parsea líneas con `processLine()`: auto-detecta delimitador y headers
8. **Upsert en `products` en batches de 1000 DURANTE el streaming** (batch flush) — no acumula en memoria
9. Productos nuevos se crean con `stock_by_source: {azeta: 0}, stock: 0` — el stock real viene del import separado

### Resilencia ante columnas faltantes
- `SAFE_COLUMNS` set: columnas que seguro existen en la tabla products
- `toSafeProduct()`: mueve campos desconocidos a `custom_fields` JSONB
- Auto-retry: si upsert falla por columna inexistente, reintenta con solo columnas seguras

### Columna `default_discount_rate`
- Columna opcional en `import_sources` para calcular `cost_price = pvp * (1 - rate)`
- Si no existe, `cost_price = pvp` (sin descuento)

### Credenciales Azeta
- URL y credenciales se guardan en `import_sources.url_template`
- URL fallback hardcodeada en `run-catalog-import.ts` (usar solo si no hay `import_sources`)
- Si el servidor devuelve HTML → error de credenciales o sesión caducada

---

## Importación Arnoia ✅ FUENTE PRINCIPAL

### Estado actual: Es la fuente de TODOS los productos y stock
- **Arnoia pobló toda la base de datos** — tanto productos como stock
- Azeta NUNCA funcionó para importar productos
- 3 import sources configurados:

| Source | Frecuencia | Qué hace | Endpoint |
|--------|-----------|----------|----------|
| **Arnoia Catálogo** | Inicial/manual | Crea todos los productos (upsert completo) | `POST /api/inventory/import/batch` |
| **Arnoia Act** | Semanal | Agrega productos nuevos (upsert) | `POST /api/inventory/import/batch` |
| **Arnoia Stock** | Diario | Solo actualiza stock + precio (UPDATE) | `POST /api/arnoia/import-stock` |

### Arquitectura
- `app/api/inventory/import/batch/route.ts` — import genérico por batches (usado por Catálogo y Act)
- `lib/arnoia/run-stock-import.ts` — import de stock dedicado
- `app/api/arnoia/import-stock/route.ts` — endpoint para stock diario

### Flujo de stock diario (Arnoia Stock)
1. Busca import_source con nombre `%arnoia%stock%`
2. Descarga CSV (latin1) desde `credentials.url` o `url_template`
3. Auto-detecta delimitador (pipe, semicolon, comma) y header
4. Parsea EAN, stock, precio por línea → mapa deduplicado
5. `bulk_update_stock_price` RPC en batches de 1000 con `p_source_key`
6. Actualiza `stock_by_source[source_key]` → trigger recalcula `stock`
7. `zero_source_stock_not_in_list` pone stock=0 en productos que ya no están en el feed

### Flujo de catálogo (Arnoia Catálogo / Act)
1. UI dispara `POST /api/inventory/import/batch` con `{ sourceId, offset }`
2. Descarga CSV completo, auto-detecta delimiter y headers
3. Mapea campos (EAN, título, autor, precio, stock, etc.)
4. Upsert en `products` por batches (crea si no existe, actualiza si ya existe)
5. Popula `stock_by_source[source_key]` para filtros por almacén

---

## OAuth Marketing

### Fix OAuth: `origin` header null en browser redirects
- `request.headers.get("origin")` retorna `null` en redirects GET del browser
- Corrección: `const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin`
- Aplicado en: `app/api/marketing/oauth/[provider]/route.ts` y `app/api/marketing/oauth/callback/route.ts`

---

## Auditoría de procesos (process_runs) ✅

### Tabla `process_runs`
Audit trail unificado para todos los procesos batch/sync/import. Cada ejecución deja un registro con status, duración, contadores y detalles en `log_json`.

### Helper `lib/process-runs.ts`
```typescript
const run = await startRun(supabase, "process_type", "Nombre Legible")
try {
  // ... trabajo ...
  await run.complete({ rows_processed, rows_updated, rows_failed, log_json: { ... } })
} catch (err) {
  await run.fail(err)
}
```
Degradación graceful: si la tabla no existe, retorna no-op handle (el proceso funciona igual).

### Procesos instrumentados

| Proceso | process_type | Archivo | Qué registra |
|---------|-------------|---------|-------------|
| Arnoia Stock diario | `arnoia_stock` | `lib/arnoia/run-stock-import.ts` | updated, not_found, zeroed, unique_eans |
| Batch Import (Catálogo/Act) | `batch_import` | `app/api/inventory/import/batch/route.ts` | created, updated, failed, missing_ean, invalid_ean |
| ML Sync Stock (cron) | `ml_sync_stock` | `app/api/cron/sync-ml-stock/route.ts` | processed, linked, errors por cuenta |
| ML Sync Orders (cron) | `ml_sync_orders` | `app/api/cron/sync-ml-orders/route.ts` | synced, errors por cuenta |
| Shopify Sync + Matching | `shopify_sync` | `app/api/shopify/sync/route.ts` | variants_total, matched, matched_ean, matched_isbn |

### Consulta rápida
```sql
SELECT process_type, status, started_at, duration_ms, rows_processed, rows_updated, rows_failed, error_message
FROM process_runs ORDER BY started_at DESC LIMIT 20;
```

---

## Contexto de trabajo en curso

- **Arnoia = fuente principal ✅** — catálogo + stock semanal + stock diario (3 import sources)
- **Azeta ❌** — nunca se usó, código existe pero no se activó en producción
- **Shopify multi-tienda ✅** — múltiples tiendas conectadas, aislamiento por store_id, nombre personalizable
- **Shopify template builder ✅** — análisis inverso de productos existentes + UI de mapeo + defaults por tienda
- **Auditoría de procesos ✅** — `process_runs` tabla + `lib/process-runs.ts` helper, 5 procesos instrumentados
- FastMail API v2 integrado y conexión verificada ✅
- FastMail cotización funcionando ✅
- Cabify Logistics integrado y conexión verificada ✅ (pendiente activación de servicios en panel Cabify)
- Módulo de atención al cliente: preguntas ML funcionando con selector de cuenta
- Módulo de marketing: en desarrollo (15+ plataformas, OAuth fix aplicado)
- Remitentes: ABM completo en `/envios/remitentes`
- Cotizador web ✅ — `/envios/cotizador`

---

## Endpoints útiles para debugging

| Endpoint | Método | Qué muestra |
|----------|--------|-------------|
| `/api/inventory/stock-overview?page=1&limit=10` | GET | Productos con `stock_by_source` completo + mapeo a warehouses |
| `/api/warehouses/[id]/debug` | GET | Sample de productos con stock_by_source, conteo por fuente |
| `/api/ops/status` | GET | Estado de proveedores, productos y stock por fuente |
| `/api/shopify/stores/[id]/analyze` | GET | Análisis inverso de productos Shopify (metafields, vendors, tags) |

---

## Bugs conocidos y fixes aplicados

| Bug | Causa | Fix |
|-----|-------|-----|
| Azeta import 100% failure (7821/7821) | upsert incluía columnas que no existen en DB (pvp_editorial, author, etc.) | SAFE_COLUMNS + toSafeProduct() + auto-retry en flushBatch() |
| Azeta HTTP 500 (OOM v1) | `adm-zip.getData()` cargaba ~500MB CSV en RAM | fflate streaming en `run-catalog-import.ts` |
| Azeta HTTP 500 (OOM v2) | `productMap` acumulaba ~600K productos (~600MB) antes de upsert | batch flush cada 1000 productos durante streaming |
| Azeta "Response body object should not be disturbed or locked" | Pipeline `Promise.all(pumpZip + Blob.put)` roto a los ~3 min | Eliminado flujo download→blob→process |
| Shopify "Tienda no encontrada" | push-product SELECT incluía columnas inexistentes → error → "not found" | Fallback SELECT con columnas mínimas |
| Shopify HTTP 400 al conectar | App custom de Shopify no estaba INSTALADA | Mensaje claro + documentación en UI |
| FastMail "cp origen incorrecto" | `cp_origen` no se enviaba al cotizador | Agregado `cp_origen` en request |
| FastMail "cp destino incorrecto" | `cp_entrega` incorrecto, cotizador usa `cp_destino` | Renombrado a `cp_destino` |
| FastMail "codigo_servicio requerido" | `servicio_default` vacío | Auto-detección via `servicios-cliente.json` |
| FastMail cotizador formato incorrecto | `parsePrecioServicioResponse` no manejaba formato real | Reescrito para detectar ambos formatos |
| ML Preguntas no importaba | `refreshTokenIfNeeded(acc.id)` esperaba objeto, recibía string | Cambiado a `getValidAccessToken(acc.id)` |
| Facebook OAuth error | `request.headers.get("origin")` = null en browser | `process.env.NEXT_PUBLIC_APP_URL \|\| request.nextUrl.origin` |
| Cabify base URL incorrecta | URL vieja `https://api.cabify.com` | Migración a `https://logistics.api.cabify.com` |
| Cabify HTTP 400 en shipping types | Parámetros separados `lat=&lon=` | Revertido a `location=lat,lon` |
| Arnoia Stock `stockKey` fuera de scope | `const stockKey` definido dentro del `for` loop pero usado fuera | Movido fuera del loop en `run-stock-import.ts` |
