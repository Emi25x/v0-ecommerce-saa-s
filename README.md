# Nexo Commerce

> Plataforma SaaS de gestión e-commerce multi-canal para vendedores en Argentina y Latinoamérica. Centraliza productos, stock, pedidos, envíos y facturación de múltiples canales de venta.

**Estado:** Producción &middot; **Deploy:** Vercel Pro &middot; **Node:** >=20 &middot; **pnpm:** 9

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React 19, Tailwind CSS v4, Radix UI (shadcn/ui) |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password) |
| Fetching | SWR, Server Components |
| Forms | React Hook Form + Zod |
| Deploy | Vercel Pro |
| Package manager | pnpm 9 |

## Módulos

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/` | KPIs, proveedores, actividad reciente |
| Inventario | `/inventory` | Catálogo unificado, stock multi-fuente, imports |
| Mercado Libre | `/ml/*` | Publicaciones, ventas, envíos, sincronización, catálogo |
| Shopify | `/shopify/*` | Multi-tienda, sync productos, exportación masiva |
| Pedidos | `/orders` | Órdenes de ML y Shopify |
| Envíos | `/envios` | Transportistas, remitentes, tracking, cotizador |
| Facturación | `/billing` | Facturas ML/Shopify, AFIP |
| Precios | `/pricing` | Listas, tipos de cambio, calculadora |
| Radar | `/radar` | Monitoreo de mercado editorial |
| Atención al cliente | `/atencion` | Inbox unificado ML + Shopify |
| Marketing | `/marketing` | Google, Meta, TikTok, email |
| Integraciones | `/integrations` | Configuración de conexiones |

## Setup local

### Prerequisitos

- Node.js 20+
- pnpm 9+
- Cuenta de Supabase (proyecto creado)

### Instalación

```bash
git clone <repo-url>
cd nexo-commerce
pnpm install
```

### Variables de entorno

Copiar el template y completar:

```bash
cp .env.example .env.local
```

Variables requeridas en `.env.local`:

```bash
# Supabase (obligatorias)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Mercado Libre (para integración ML)
MERCADOLIBRE_CLIENT_ID=
MERCADOLIBRE_CLIENT_SECRET=

# App URL (desarrollo)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# OpenAI (opcional — para features de IA)
OPENAI_API_KEY=
```

> Las credenciales de proveedores (Arnoia, Libral), transportistas (Cabify, FastMail) y tiendas Shopify se guardan en la base de datos, no en variables de entorno.

### Migraciones de DB

Aplicar los scripts SQL en orden desde `scripts/` y `supabase/migrations/`:

```bash
# Con Supabase CLI
supabase db push

# O manualmente en el SQL Editor de Supabase
# Ejecutar scripts en scripts/ y supabase/migrations/ en orden numérico
```

### Desarrollo

```bash
pnpm dev          # Arranca Next.js en http://localhost:3000
```

## Scripts disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| Dev server | `pnpm dev` | Next.js en modo desarrollo |
| Build | `pnpm build` | Build de producción |
| Start | `pnpm start` | Sirve el build de producción |
| Type check | `pnpm typecheck` | `tsc --noEmit` |
| Lint | `pnpm lint` | ESLint con zero warnings |
| Lint fix | `pnpm lint:fix` | ESLint con auto-fix |
| Format | `pnpm format` | Prettier write |
| Format check | `pnpm format:check` | Prettier check |
| Test | `pnpm test` | Vitest (una corrida) |
| Test watch | `pnpm test:watch` | Vitest en modo watch |
| Validate | `pnpm validate` | typecheck + lint + format check |

## Deploy

El proyecto se despliega en **Vercel Pro** con las siguientes configuraciones:

- **Framework preset**: Next.js
- **Build command**: `pnpm build`
- **Node.js**: 20.x
- **Serverless functions**: `maxDuration=300` (plan Pro)
- **Cron jobs**: 16 tareas programadas definidas en `vercel.json`

### Cron jobs principales

| Job | Schedule | Descripción |
|-----|----------|-------------|
| Arnoia Stock | Cada 3 horas | Actualización de stock desde proveedor principal |
| ML Stock Sync | 9:00 AM | Sincronización de stock con MercadoLibre |
| ML Orders Sync | 9:30 AM | Sincronización de órdenes ML |
| Process Orders | Cada 2 horas | Procesamiento de órdenes pendientes |
| ML Auto-sync | 2:00 AM | Sincronización completa de todas las cuentas |

## Estructura del proyecto

```
app/
├── (auth)/              # Rutas públicas (login)
├── (dashboard)/         # Rutas autenticadas (sidebar + topbar)
│   ├── page.tsx         # Dashboard home
│   ├── ml/              # Mercado Libre
│   ├── shopify/         # Shopify
│   ├── inventory/       # Inventario
│   ├── envios/          # Envíos
│   ├── billing/         # Facturación
│   └── ...
├── api/                 # API routes
│   ├── ops/             # Status y métricas
│   ├── ml/              # ML endpoints
│   ├── shopify/         # Shopify endpoints
│   ├── inventory/       # Inventario endpoints
│   ├── cron/            # Cron jobs
│   └── ...
└── layout.tsx           # Root layout

components/
├── layout/              # Shell: sidebar, topbar, breadcrumb, page-header
├── ui/                  # shadcn/ui primitives
├── shared/              # Componentes reutilizables
├── mercadolibre/        # Componentes ML
├── inventory/           # Componentes de inventario
└── suppliers/           # Componentes de proveedores

lib/
├── db/                  # Supabase clients (client, server, admin, proxy)
├── navigation.tsx       # Definición declarativa de navegación
├── carriers/            # Integraciones de transportistas
├── arnoia/              # Import de Arnoia
├── azeta/               # Import de Azeta
├── shopify-auth.ts      # Auth helpers para Shopify
├── mercadolibre.ts      # Client de ML
├── process-runs.ts      # Audit trail helper
└── import/              # Lógica de importación

hooks/                   # React hooks custom
domains/                 # Lógica de dominio por módulo
scripts/                 # Migraciones SQL
supabase/migrations/     # Migraciones Supabase
```

## Troubleshooting

### El build falla con errores de TypeScript

```bash
pnpm typecheck    # Ver errores exactos
```

### Supabase no conecta

1. Verificar que `NEXT_PUBLIC_SUPABASE_URL` no termine en `/rest/v1` ni `/auth/v1` — el client normaliza la URL pero es mejor usar la base
2. Verificar que `SUPABASE_SERVICE_ROLE_KEY` sea el service role, no el anon key
3. Si una query falla por columna inexistente, ejecutar las migraciones pendientes

### Import de proveedor falla

1. Verificar credenciales en `import_sources` (tabla en Supabase)
2. Revisar `process_runs` para el log del último intento:
   ```sql
   SELECT * FROM process_runs ORDER BY started_at DESC LIMIT 5;
   ```
3. Los imports de Arnoia usan encoding `latin1` — si ves caracteres rotos, es problema de encoding

### OAuth de MercadoLibre no redirige

- Verificar `NEXT_PUBLIC_APP_URL` en las variables de entorno
- La redirect URI en ML debe coincidir: `{APP_URL}/api/mercadolibre/callback`

### Shopify "Tienda no encontrada"

- La app custom debe estar **instalada** en Shopify Admin > Apps > Develop apps > Install
- Si usa Client Credentials, la app debe estar instalada antes de conectar

## Documentación adicional

- [Arquitectura](docs/ARCHITECTURE.md) — Diagramas y decisiones de diseño
- [Contribuir](CONTRIBUTING.md) — Flujo de trabajo, convenciones, PR checklist
- [ADRs](docs/adr/) — Architecture Decision Records

## Licencia

Propietario. Todos los derechos reservados.
