# Contribuir a Nexo Commerce

## Antes de empezar

1. Leé el [README](README.md) para entender el proyecto
2. Leé la [Arquitectura](docs/ARCHITECTURE.md) para entender la estructura
3. Asegurate de poder correr `pnpm dev` y `pnpm validate` sin errores

## Setup de desarrollo

```bash
pnpm install
cp .env.example .env.local   # Completar variables
pnpm dev
```

## Flujo de trabajo

### 1. Branches

Seguimos una convención simple basada en el tipo de cambio:

```
feat/<descripcion-corta>     # Nueva funcionalidad
fix/<descripcion-corta>      # Bug fix
refactor/<descripcion-corta> # Refactor sin cambio funcional
docs/<descripcion-corta>     # Solo documentación
chore/<descripcion-corta>    # Dependencias, config, CI
```

Ejemplos:
```
feat/shopify-bulk-export
fix/arnoia-stock-import-encoding
refactor/sidebar-data-driven
docs/add-architecture-guide
```

La rama principal es `main`. Todas las features se hacen en branches y se mergean via PR.

### 2. Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<scope>): <descripción>

[cuerpo opcional]
```

**Tipos:**

| Tipo | Cuándo |
|------|--------|
| `feat` | Nueva funcionalidad visible al usuario |
| `fix` | Bug fix |
| `refactor` | Cambio interno sin efecto funcional |
| `docs` | Documentación |
| `style` | Formateo, whitespace, punto y coma |
| `test` | Agregar o corregir tests |
| `chore` | Dependencias, CI, scripts de build |
| `perf` | Mejora de performance |

**Scopes comunes:** `ml`, `shopify`, `inventory`, `envios`, `billing`, `sidebar`, `auth`, `db`, `api`

**Ejemplos:**
```
feat(shopify): add bulk export with metafields support
fix(ml): handle expired token during stock sync
refactor(sidebar): extract navigation data to lib/navigation
chore(deps): update next.js to 15.5.9
```

**Reglas:**
- Imperativo en inglés: "add", "fix", "update" — no "added", "fixing"
- Primera línea < 72 caracteres
- Sin punto final en la primera línea
- El cuerpo explica el "por qué", no el "qué"

### 3. Pull Requests

Cada PR debe seguir este checklist antes de pedir review:

#### PR Checklist

- [ ] La rama está actualizada con `main`
- [ ] `pnpm typecheck` pasa sin errores
- [ ] `pnpm lint` pasa sin warnings
- [ ] `pnpm format:check` pasa
- [ ] `pnpm test` pasa (si hay tests relevantes)
- [ ] `pnpm build` compila correctamente
- [ ] Los cambios no rompen dark mode (no usar `bg-white`, `text-black`, etc.)
- [ ] Los cambios no hardcodean credenciales ni secrets
- [ ] Si toca la DB: migración SQL incluida en `supabase/migrations/`
- [ ] Si agrega endpoint: documentado en CLAUDE.md o en la sección correspondiente
- [ ] Si agrega ruta nueva: agregada en `lib/navigation.tsx` y `components/layout/breadcrumb.tsx`

#### Formato del PR

```markdown
## Qué cambia

Descripción breve de qué hace este PR y por qué.

## Cómo probar

1. Paso a paso para verificar el cambio
2. ...

## Screenshots (si aplica)

## Checklist

- [ ] Typecheck OK
- [ ] Lint OK
- [ ] Build OK
- [ ] Probado manualmente
```

### 4. Definition of Done

Un feature se considera "terminado" cuando:

- [ ] **Funcional**: la feature hace lo que se pidió
- [ ] **Type-safe**: `pnpm typecheck` pasa sin errores
- [ ] **Linted**: `pnpm lint` y `pnpm format:check` pasan
- [ ] **Buildeable**: `pnpm build` compila
- [ ] **Dark mode**: compatible con el tema (usa tokens CSS, no colores hardcodeados)
- [ ] **Responsive**: funciona en desktop (1280px+) — mobile es secundario
- [ ] **Navegable**: ruta accesible desde sidebar, breadcrumb funciona
- [ ] **Datos/presentación separados**: fetching en server components o hooks, no en `useEffect` + `fetch` directo
- [ ] **Migración incluida**: si toca el schema, hay SQL en `supabase/migrations/`
- [ ] **Sin secrets expuestos**: credenciales en DB o env vars, nunca hardcodeadas
- [ ] **Audit trail**: procesos batch usan `process_runs` via `lib/process-runs.ts`
- [ ] **Error handling**: errores de API devuelven JSON con mensaje claro

## Convenciones de código

### UI

- Usar tokens de color: `bg-background`, `text-foreground`, `border-border` — nunca `bg-white`
- Headers de página: usar `<PageHeader>` de `components/layout/page-header.tsx`
- Formularios: React Hook Form + Zod
- Data fetching: Server Components o SWR — no `useEffect` + `fetch`
- Componentes: un componente por archivo, nombre = PascalCase, archivo = kebab-case

### API Routes

- Patrón: `try/catch` + `NextResponse.json()`
- Server-side: `createAdminClient()` (service role)
- Auth-required: `createClient()` (sesión de usuario)
- Resilencia: si una columna puede no existir, usar fallback a columnas seguras

### Base de datos

- Tablas: `snake_case`
- Stock: solo actualizar `stock_by_source` — el trigger recalcula `stock`
- Batch operations: usar RPCs (`bulk_update_stock_price`, etc.)
- Audit: wrappear procesos con `startRun()` / `run.complete()` / `run.fail()`

### Nomenclatura

| Contexto | Convención | Ejemplo |
|----------|-----------|---------|
| Tablas DB | snake_case | `shopify_product_links` |
| Columnas DB | snake_case | `stock_by_source` |
| Variables JS/TS | camelCase | `stockBySource` |
| Componentes React | PascalCase | `PageHeader` |
| Archivos de componente | kebab-case | `page-header.tsx` |
| API routes | kebab-case | `recent-runs/route.ts` |
| Slugs de carriers | lowercase | `"cabify"`, `"fastmail"` |
| Source keys | lowercase | `"arnoia"`, `"azeta"` |
