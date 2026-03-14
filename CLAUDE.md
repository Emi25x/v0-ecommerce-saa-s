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
| Envíos | `/envios` | Transportistas, remitentes, tracking |
| Shopify | `/shopify` | Sync productos/pedidos/inventario |
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
- **Shopify** — OAuth, GraphQL API (productos, pedidos, inventario)

### Fuentes de inventario (proveedores)
- **Azeta** — Catálogo + stock via API
- **Arnoia** — Stock + precios via API
- **Libral ERP** — Distribuidora de libros, dual-currency (EUR + ARS)

### Transportistas (Argentina)
- **Cabify Logistics** — OAuth 2.0, cotización, etiquetas, tracking
  - `lib/carriers/cabify.ts`
  - Base URL: `https://logistics.api.cabify.com` (corregida, la anterior `https://api.cabify.com` era incorrecta)
  - Auth URL: `https://cabify.com/auth/api/authorization`
  - `getShippingTypes()` usa `location=lat,lon` (NO `lat=&lon=` separados — eso da HTTP 400)
  - Conexión verificada ✅ (0 tipos disponibles = cuenta sin servicios activados del lado de Cabify)
- **FastMail** — API v2, autenticación via `api_token` en body POST
  - `lib/carriers/fastmail.ts`
  - Base URL: `https://epresislv.fastmail.com.ar`
  - Todos los endpoints usan POST con `{ api_token, ...params }` en el body
  - Endpoints implementados: `dummy-test.json` (health), `cotizador.json`, `guias.json`, `seguimiento.json`, `servicios-cliente.json`, `sucursalesByCliente.json`, `solicitarRetiro.json`, `generaRecepcion.json`, `editarSucursal.json`, `localidades.json`, `print-etiquetas-custom`, `etiquetas-cliente`, `integracion.json`
  - Conexión verificada ✅
  - **Cotizador**: requiere `cp_origen` (CP de la sucursal/remitente), `cp_destino` (CP destino — NO `cp_entrega`), `codigo_servicio` y `productos`. El `codigo_servicio` se auto-detecta via `servicios-cliente.json` si no está configurado en `servicio_default`.
  - **Guías**: usa `valorDeclarado` (camelCase, NO `valor_declarado`). Requiere `codigo_sucursal`.
  - `sucursal` en config = string alfanumérico (código de sucursal del cliente en FastMail)
  - ⚠️ `seguimiento.json` (tracking) — confirmar nombre correcto con manual oficial (podría ser `seguirEnvio.json`)

### Marketing (15+ plataformas)
Google Ads/Analytics/Search Console/Merchant, Meta Ads, TikTok Ads, LinkedIn, Pinterest,
Klaviyo, Mailchimp, Brevo, HubSpot, ActiveCampaign, WhatsApp Business

---

## Base de datos (Supabase)

### Tablas clave
- `products` — catálogo unificado (ean, sku, title, price, cost_price, stock, stock_by_source JSONB)
- `import_sources` — config de fuentes de datos (Azeta, Arnoia, Libral con credentials JSONB)
- `ml_accounts` — cuentas de Mercado Libre (tokens OAuth)
- `shopify_stores` — tiendas Shopify (tokens OAuth)
- `carriers` — transportistas (slug, config JSONB, credentials JSONB)
- `shipments` — envíos (tracking_number, status, carrier_slug, external_id)
- `remitentes` — direcciones de origen para envíos (ABM en `/envios/remitentes`)
- `marketing_connections` — tokens de plataformas de marketing
- `repricing_rules` — reglas de repricing automático
- `cs_conversations` — conversaciones de atención al cliente (ML, Shopify, WhatsApp)
- `cs_messages` — mensajes individuales por conversación
- `cs_response_templates` — plantillas de respuesta rápida

### Funciones PL/pgSQL
- `bulk_update_azeta_stock(ean[], stock[])` — actualización masiva de stock
- `bulk_update_stock_price(ean[], stock[], price[])` — stock + precio
- `bulk_update_stock_two_prices(ean[], stock[], price_eur[], price_ars[])` — multi-moneda

### Migraciones
En `supabase/migrations/` y `scripts/`. Los archivos SQL se aplican manualmente o vía Supabase CLI.

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

# Shopify (por tienda, pueden guardarse en DB)
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ACCESS_TOKEN=

# OpenAI (opcional)
OPENAI_API_KEY=

# Vercel (auto-detectado)
VERCEL_URL=
```

Las credenciales de proveedores (Azeta, Arnoia, Libral) y transportistas (Cabify, FastMail)
se guardan en columnas JSONB en la base de datos, no en variables de entorno.

---

## Patrones y convenciones

### API Routes
- Todas en `app/api/` como `route.ts`
- Usan `createAdminClient()` (service role) para operaciones server-side
- Patrón: `try/catch` + `NextResponse.json()`

### Autenticación
- Middleware en `middleware.ts` protege todas las rutas
- Rutas públicas: `/login`, `/auth/*`, algunos endpoints de cron/API

### Nomenclatura
- Tablas DB: snake_case en español (e.g., `remitentes`, `transportistas`)
- Código JS/TS: camelCase
- Slugs de carriers: `"cabify"`, `"fastmail"`
- Slugs de fuentes: `"azeta"`, `"arnoia"`, `"libral"`

### Flujo de datos
```
Proveedores (Azeta/Arnoia/Libral)
  → import_sources → products (stock_by_source JSONB)
  → Sync a ML / Shopify

Pedidos ML/Shopify → DB → facturación/envíos
Envíos → carrier API → tracking updates en shipments
```

---

## Ramas activas relevantes

- `main` — producción
- `claude/fix-supplier-imports-R0q3s` — fixes en imports de suppliers y cliente FastMail
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

### Arquitectura
- `lib/azeta/run-catalog-import.ts` — lógica central, llamada por cron y por UI
- `app/api/azeta/import-catalog/route.ts` — endpoint cron + UI (maxDuration=300)
- `app/api/azeta/import-stock/route.ts` — actualización de stock (sin catálogo)
- `app/api/azeta/download/route.ts` + `app/api/azeta/process/route.ts` — flujo chunked con Vercel Blob (alternativa para UI resumable)

### Flujo de importación (Azeta Total)
1. UI llama `POST /api/azeta/import-catalog` con `{ source_id }`
2. `runCatalogImport()` resuelve URL desde `import_sources` (fallback: URL hardcodeada)
3. Descarga ZIP (~230MB) via `fetch()` con streaming ReadableStream
4. Detecta formato en primer chunk (magic bytes `PK` = ZIP, sino CSV)
5. ZIP: descomprime con `fflate` streaming (`Unzip` + `UnzipInflate`) sin cargar el archivo completo en RAM
6. CSV: procesa stream directamente con `TextDecoder("latin1")` incremental
7. Parsea líneas con `processLine()`: auto-detecta delimitador y headers
8. Upsert en `products` en batches de 500 con `onConflict: "ean"`

### ⚠️ Problema resuelto: OOM en Lambda de Vercel
- **Causa**: `adm-zip.getData()` cargaba ~500MB (CSV descomprimido) + ~230MB (ZIP original) en RAM → crash Lambda
- **Fix**: reemplazado con `fflate` streaming (`Unzip.push()` incremental), nunca tiene el archivo completo en RAM
- **Síntoma**: HTTP 500 sin mensaje de error (Lambda crasheaba antes de responder)

### Columna `default_discount_rate`
- Columna opcional en `import_sources` para calcular `cost_price = pvp * (1 - rate)`
- Script para agregar: `scripts/add-discount-rate-to-import-sources.sql`
- Si no existe, `cost_price = pvp` (sin descuento)

### Credenciales Azeta
- URL y credenciales se guardan en `import_sources.url_template`
- URL fallback hardcodeada en `run-catalog-import.ts` (usar solo si no hay `import_sources`)
- Si el servidor devuelve HTML → error de credenciales o sesión caducada

---

## OAuth Marketing

### Fix OAuth: `origin` header null en browser redirects
- `request.headers.get("origin")` retorna `null` en redirects GET del browser
- Corrección: `const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin`
- Aplicado en: `app/api/marketing/oauth/[provider]/route.ts` y `app/api/marketing/oauth/callback/route.ts`

---

## Contexto de trabajo en curso

- FastMail API v2 integrado y conexión verificada ✅
- Cabify Logistics integrado y conexión verificada ✅ (pendiente activación de servicios en panel Cabify)
- Módulo de atención al cliente: preguntas ML funcionando con selector de cuenta
- Módulo de marketing: en desarrollo (15+ plataformas, OAuth fix aplicado)
- Remitentes: ABM completo en `/envios/remitentes` (accesible desde sidebar)
- Azeta import: fix OOM aplicado (fflate streaming) ✅ — implementación completa y lista para producción en Vercel Pro
  - `productMap` acumula todos los productos en memoria (~100MB para catálogo completo) — aceptable en Pro (1024MB RAM default)
  - Tiempo estimado de ejecución: 2–4 min dentro del límite de 300s
  - No se necesita el flujo chunked (download+process) ni mover a cron exclusivo — el endpoint directo funciona en Pro

---

## Bugs conocidos y fixes aplicados

| Bug | Causa | Fix |
|-----|-------|-----|
| Azeta HTTP 500 | OOM al cargar ~500MB CSV en RAM | fflate streaming en `run-catalog-import.ts` |
| FastMail "cp origen incorrecto" | `cp_origen` no se enviaba al cotizador | Agregado `cp_origen` en `FastMailCotizadorRequest` y `quote()` |
| FastMail "cp destino incorrecto" | `cp_entrega` incorrecto, cotizador usa `cp_destino` | Renombrado a `cp_destino` en `FastMailCotizadorRequest` y `quote()` |
| FastMail "codigo_servicio requerido" | `servicio_default` vacío | Auto-detección via `servicios-cliente.json` |
| ML Preguntas no importaba | `refreshTokenIfNeeded(acc.id)` esperaba objeto, recibía string | Cambiado a `getValidAccessToken(acc.id)` que toma string y retorna string |
| Facebook OAuth error | `request.headers.get("origin")` = null en browser | `process.env.NEXT_PUBLIC_APP_URL \|\| request.nextUrl.origin` |
| Cabify base URL incorrecta | URL vieja `https://api.cabify.com` | Migración `20260313_fix_cabify_config.sql` a `https://logistics.api.cabify.com` |
| Cabify HTTP 400 en shipping types | Parámetros separados `lat=&lon=` | Revertido a `location=lat,lon` |
