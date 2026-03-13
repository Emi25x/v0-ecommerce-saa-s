# CLAUDE.md — Contexto del Proyecto

## ¿Qué es este proyecto?

**SaaS de gestión e-commerce multi-canal** para vendedores argentinos/latinoamericanos.
Centraliza productos, stock, pedidos, envíos y facturación de múltiples canales de venta.

- **Stack:** Next.js 15, React 19, TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS v4
- **UI:** Radix UI, React Hook Form + Zod, SWR para fetching
- **Deploy:** Vercel

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
  - `getShippingTypes()` usa params `lat=&lon=` (no `location=lat,lon`)
  - Conexión verificada ✅ (0 tipos disponibles = cuenta sin servicios activados del lado de Cabify)
- **FastMail** — API v2, autenticación via `api_token` en body POST
  - `lib/carriers/fastmail.ts`
  - Base URL: `https://epresislv.fastmail.com.ar`
  - Todos los endpoints usan POST con `{ api_token, ...params }` en el body
  - Endpoints implementados: `dummy-test.json` (health), `consultarStock`, `listarCps`, `generaRecepcion.json`, `editarSucursal.json`, `seguirEnvio.json` (tracking)
  - Conexión verificada ✅
  - ⚠️ El endpoint de tracking `seguirEnvio.json` es provisorio — confirmar con el manual oficial

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

## Contexto de trabajo en curso

- FastMail API v2 integrado y conexión verificada ✅
- Cabify Logistics integrado y conexión verificada ✅ (pendiente activación de servicios en panel Cabify)
- Módulo de atención al cliente: preguntas ML funcionando con selector de cuenta
- Módulo de marketing: en desarrollo (15+ plataformas, pendiente integración OAuth real)
- Remitentes: ABM completo en `/envios/remitentes` (accesible desde sidebar)
