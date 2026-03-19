# ADR-001: Decisiones iniciales de arquitectura

**Fecha:** 2026-03-19
**Estado:** Aceptado
**Autores:** Equipo Nexo Commerce

## Contexto

Nexo Commerce es un SaaS de gestión e-commerce multi-canal. Se necesita una arquitectura que soporte:

- Múltiples canales de venta (MercadoLibre, Shopify)
- Múltiples fuentes de inventario (Arnoia, Libral, Azeta)
- Procesamiento batch de catálogos grandes (200K+ productos)
- Sincronización periódica de stock, pedidos y envíos
- Multi-tienda (varias tiendas Shopify por usuario)

## Decisiones

### 1. Next.js App Router como framework full-stack

**Decisión:** Usar Next.js 15 con App Router para frontend y backend.

**Razones:**
- Server Components para páginas que no necesitan interactividad
- API Routes para endpoints de backend sin servidor separado
- Deploy trivial en Vercel con soporte para cron jobs
- Un solo repo, un solo deploy, un solo lenguaje

**Trade-offs:**
- Serverless functions tienen timeout (300s en Vercel Pro)
- No hay workers de larga duración — los imports grandes se procesan en streaming

### 2. Supabase como base de datos y auth

**Decisión:** Usar Supabase (PostgreSQL hosted) con Row Level Security.

**Razones:**
- PostgreSQL con funciones PL/pgSQL para lógica compleja (RPCs de batch)
- Auth integrado (email/password, OAuth)
- API auto-generada para CRUD simple
- Realtime disponible si se necesita en el futuro
- JSONB nativo para datos semi-estructurados (stock_by_source, credentials)

**Trade-offs:**
- Dependencia de un servicio managed
- Las migraciones se manejan manualmente (no hay ORM)

### 3. Stock multi-fuente con JSONB + trigger

**Decisión:** Guardar stock por proveedor en `stock_by_source` (JSONB) y calcular el total automáticamente via trigger.

```sql
products.stock_by_source = {"arnoia": 45, "azeta": 0, "libral": 12}
products.stock = 57  -- calculado por trigger
```

**Razones:**
- Un solo UPDATE para cambiar stock de un proveedor
- El total se calcula atómicamente (no hay race conditions)
- No requiere tabla extra de stock (simplifica queries)
- Filtros por proveedor son simples: `stock_by_source->>'arnoia'`

**Alternativas consideradas:**
- Tabla `stock_levels (product_id, source, quantity)` — más normalizada pero requiere JOINs y lógica de agregación en cada query
- Campo `stock` manual — requiere que cada import calcule el total, propenso a errores

### 4. Credenciales en DB (no en env vars)

**Decisión:** Guardar credenciales de proveedores, transportistas y tiendas Shopify en columnas JSONB encriptadas en la base de datos.

**Razones:**
- Permite configuración dinámica desde la UI (agregar proveedor sin redeploy)
- Soporta multi-tenant naturalmente
- Supabase tiene RLS para controlar acceso

**Trade-offs:**
- Las credenciales están en la DB (requiere service role para acceder)
- No se benefician del vault de Vercel (excepto Supabase keys y ML credentials)

### 5. Audit trail con process_runs

**Decisión:** Crear una tabla genérica `process_runs` para registrar la ejecución de todos los procesos batch.

**Razones:**
- Un solo lugar para ver el estado de imports, syncs, y procesos programados
- Helper con degradación graceful (si la tabla no existe, el proceso sigue funcionando)
- Métricas consistentes: duration_ms, rows_processed, rows_failed, log_json

**Alternativas consideradas:**
- Logging a servicio externo (Datadog, etc.) — más costoso, no necesario en esta etapa
- Logs en archivo — no persistentes en serverless

### 6. Multi-tienda Shopify con aislamiento por store_id

**Decisión:** Soportar múltiples tiendas Shopify simultáneamente con aislamiento total por `store_id` en todas las tablas de linking.

**Razones:**
- Un vendedor puede tener tiendas B2C y B2B en Shopify
- Cada tienda tiene su catálogo, precios, templates y configuración
- UNIQUE constraints compuestos evitan colisiones

**Trade-offs:**
- Todas las queries de Shopify necesitan filtrar por store_id
- La UI necesita selector de tienda activa

### 7. Sidebar data-driven

**Decisión:** Definir la navegación del sidebar como datos declarativos en `lib/navigation.tsx` en vez de JSX hardcodeado.

**Razones:**
- Una sola fuente de verdad para la estructura de navegación
- Fácil de agregar/reordenar secciones sin tocar markup
- Los badges se resuelven por key, no por lógica en el componente
- Testeable: los datos de navegación son un array exportado

## Consecuencias

- Los imports grandes deben procesarse en streaming (no cargar todo en memoria)
- Las migraciones SQL se manejan manualmente y deben versionarse en `supabase/migrations/`
- Los procesos batch siempre deben usar `startRun()` para audit trail
- Cada nueva ruta debe agregarse a `lib/navigation.tsx` y `components/layout/breadcrumb.tsx`
