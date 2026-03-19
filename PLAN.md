# Tech Lead Audit: Configuración Profesional

## Hallazgos y Cambios Propuestos

---

## 1. HALLAZGOS CRÍTICOS

### 1.1 `next.config.mjs` — ignoreBuildErrors + ignoreDuringBuilds

```js
typescript: { ignoreBuildErrors: true }   // ← PELIGROSO
eslint: { ignoreDuringBuilds: true }      // ← PELIGROSO
```

**Problema**: El build NUNCA falla por errores de tipos ni de lint. Esto permite
deployar código roto a producción sin ninguna señal de alerta. Es el equivalente
a desactivar los frenos de un auto.

**Cambio**: Eliminar ambas líneas. El build debe fallar si hay errores.

### 1.2 React 19.2 con @types/react@18

```
react: 19.2.0
@types/react: ^18     →  instalado: 18.3.28
@types/react-dom: ^18
```

**Problema**: Los tipos de React 18 no conocen las APIs de React 19 (use(),
useActionState, etc.). Genera errores de tipo falsos y oculta errores reales.

**Cambio**: `@types/react` y `@types/react-dom` → `^19`.

### 1.3 Dos lock files: package-lock.json + pnpm-lock.yaml

**Problema**: Ambigüedad sobre qué package manager usar. Dos árboles de
dependencias potencialmente distintos. Race condition en CI.

**Cambio**: Elegir pnpm (ya tiene pnpm-lock.yaml). Borrar `package-lock.json`.

### 1.4 129 errores de TypeScript (ocultos por ignoreBuildErrors)

Breakdown:
- 112 TS2344: params de Next.js 15 deben ser `Promise<{id: string}>` (no `{id: string}`)
- 5 TS2551: `.catch()` en Supabase client (API cambió)
- 4 TS2339: Property no existe
- 3 TS2345: Tipo incompatible
- 2 TS7006: `any` implícito
- 1 TS2307: Módulo no encontrado (`lib/shopify`)
- 1 TS2322: Buffer → BlobPart
- 1 TS2698: Spread de non-object

Los 112 TS2344 son del `.next/types/` generado — se arreglan haciendo que los
route handlers usen `params: Promise<{id: string}>` (Next.js 15 breaking change).

Los otros 17 son errores reales en el código fuente.

### 1.5 No hay ESLint configurado

`next lint` está deprecado en Next.js 16+. No hay `.eslintrc` ni `eslint.config`.
Actualmente el lint ni siquiera corre.

### 1.6 No hay Prettier, tests, ni CI

- Sin formatter → inconsistencia de estilo entre developers
- Sin tests → sin red de seguridad
- Sin CI → todo se valida manualmente (o no se valida)

### 1.7 Dependencias problemáticas

| Dep | Problema |
|-----|----------|
| `bufferutil: "latest"` | Tag `latest` es no-determinístico. Puede romper builds. |
| `utf-8-validate: "latest"` | Idem. |
| `ws: "latest"` | Idem. |
| `xlsx: 0.18.5` | Duplicado con `exceljs: 4.4.0`. Dos libs para lo mismo. |
| `react-toastify: 11.0.5` | Duplicado con `sonner` y `@radix-ui/react-toast`. Tres sistemas de toast. |
| `react-feather: 2.0.10` | Duplicado con `lucide-react`. Dos libs de iconos. |
| `adm-zip: 0.5.16` | Se reemplazó por `fflate` (streaming). Ya no se usa según CLAUDE.md. |
| `autoprefixer: ^10.4.20` | Innecesario con Tailwind CSS v4 (incluye autoprefixer). |
| `@ai-sdk/openai`, `openai`, `ai` | ¿Se usan todos? Verificar. |

### 1.8 `allowJs: true` en tsconfig sin archivos .js

No hay archivos `.js` en el proyecto. `allowJs` es innecesario y podría
permitir que alguien agregue archivos JS sin tipado accidentalmente.

### 1.9 `target: "ES6"` es demasiado bajo

Next.js 15 con React 19 apunta a navegadores modernos. ES6 genera código
innecesariamente transpilado. Next.js recomienda `ES2017` o superior.

---

## 2. ARCHIVOS NUEVOS/MODIFICADOS

### 2.1 `next.config.mjs` (MODIFICADO)

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["node-forge", "puppeteer-core", "@sparticuz/chromium-min"],
}

export default nextConfig
```

Cambios:
- ELIMINADO `typescript.ignoreBuildErrors`
- ELIMINADO `eslint.ignoreDuringBuilds`

### 2.2 `tsconfig.json` (MODIFICADO)

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "target": "ES2017",
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "scripts"]
}
```

Cambios:
- `allowJs: false` (no hay .js files)
- `target: "ES2017"` (modern browsers)

### 2.3 `package.json` — scripts section

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "validate": "pnpm typecheck && pnpm lint && pnpm format:check"
  }
}
```

Nota: `test` y `test:watch` se agregan cuando se elija un framework de test
(Vitest recomendado para Next.js 15).

### 2.4 `package.json` — devDependencies actualizadas

```json
{
  "devDependencies": {
    "@eslint/js": "^9.28.0",
    "@tailwindcss/postcss": "^4.1.9",
    "@types/adm-zip": "^0.5.7",
    "@types/node": "^22",
    "@types/node-forge": "1.3.11",
    "@types/papaparse": "^5.5.2",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "^15.5.9",
    "eslint-config-prettier": "^10.1.5",
    "postcss": "^8.5",
    "prettier": "^3.5.3",
    "tailwindcss": "^4.1.9",
    "tw-animate-css": "1.3.3",
    "typescript": "^5",
    "typescript-eslint": "^8.34.0"
  }
}
```

Cambios:
- `@types/react` y `@types/react-dom` → `^19`
- Agregar `eslint`, `eslint-config-next`, `eslint-config-prettier`, `typescript-eslint`
- Agregar `prettier`

### 2.5 `package.json` — dependencies a limpiar

Fijar versiones de `latest`:
```json
"bufferutil": "^4.0.9",
"utf-8-validate": "^6.0.6",
"ws": "^8.18.0"
```

Candidatos a eliminar (verificar uso primero):
- `adm-zip` — reemplazado por `fflate`
- `react-feather` — reemplazado por `lucide-react`
- `react-toastify` — reemplazado por `sonner` + `@radix-ui/react-toast`
- `xlsx` — posiblemente reemplazado por `exceljs`
- `autoprefixer` — innecesario con Tailwind v4

Eliminar `package-lock.json` (mantener solo `pnpm-lock.yaml`).

### 2.6 `eslint.config.mjs` (NUEVO)

```js
import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"
import eslintConfigPrettier from "eslint-config-prettier"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  eslintConfigPrettier,
  {
    rules: {
      // Permitir `any` explícito por ahora (muchos usos legacy)
      "@typescript-eslint/no-explicit-any": "warn",
      // Permitir variables no usadas con prefijo _
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      // Deshabilitar reglas que conflictúan con Prettier
      // (eslint-config-prettier ya lo hace, esto es por seguridad)
    },
  },
]

export default eslintConfig
```

### 2.7 `.prettierrc` (NUEVO)

```json
{
  "semi": false,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 120,
  "plugins": [],
  "endOfLine": "lf"
}
```

Nota: `semi: false` porque el código existente no usa semicolons.

### 2.8 `.prettierignore` (NUEVO)

```
node_modules
.next
pnpm-lock.yaml
package-lock.json
*.md
```

### 2.9 `.github/workflows/ci.yml` (NUEVO)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Build
        run: pnpm build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-key
```

### 2.10 Husky + lint-staged (OPCIONAL)

**Recomendación: NO agregar ahora.**

Razones:
- Con 129 errores de TS y lint sin configurar, Husky bloquearía TODOS los commits
  hasta resolver todo. Eso paraliza el desarrollo.
- Mejor flujo: arreglar errores primero → CI verde → recién entonces agregar Husky.

Cuando sea momento:
```bash
pnpm add -D husky lint-staged
npx husky init
```

`.lintstagedrc.json`:
```json
{
  "*.{ts,tsx}": ["eslint --fix --max-warnings 0", "prettier --write"],
  "*.{json,css,md}": ["prettier --write"]
}
```

---

## 3. ORDEN DE MIGRACIÓN

Estos pasos están diseñados para no romper todo de golpe:

### Fase 1: Fundamentos (no rompe nada)
1. Fijar versiones de `bufferutil`, `utf-8-validate`, `ws` (eliminar `latest`)
2. Actualizar `@types/react` y `@types/react-dom` a `^19`
3. Cambiar `allowJs: false` y `target: "ES2017"` en tsconfig
4. Borrar `package-lock.json` (mantener solo pnpm-lock.yaml)
5. Instalar ESLint + Prettier + configs
6. Crear `eslint.config.mjs`, `.prettierrc`, `.prettierignore`
7. Agregar scripts: `typecheck`, `lint`, `lint:fix`, `format`, `format:check`, `validate`

### Fase 2: Arreglar errores de tipo (el grueso del trabajo)
8. Arreglar 112 errores TS2344 (params → Promise<params> en route handlers)
9. Arreglar 17 errores reales en código fuente
10. Verificar que `pnpm typecheck` pasa limpio

### Fase 3: Quitar las muletas
11. Eliminar `ignoreBuildErrors: true` de next.config.mjs
12. Eliminar `ignoreDuringBuilds: true` de next.config.mjs
13. Verificar que `pnpm build` pasa limpio

### Fase 4: Lint y formato
14. Correr `pnpm lint:fix` y resolver warnings
15. Correr `pnpm format` para formatear todo el código
16. Commit del reformateo (un solo commit grande, aislado)

### Fase 5: CI
17. Crear `.github/workflows/ci.yml`
18. Verificar que CI pasa en un PR de prueba

### Fase 6: Limpieza de dependencias
19. Verificar y eliminar `adm-zip` si no se usa
20. Verificar y eliminar `react-feather` si no se usa
21. Verificar y consolidar toast libraries
22. Verificar y consolidar xlsx vs exceljs
23. Eliminar `autoprefixer`

### Fase 7: Husky (después de CI verde)
24. Instalar Husky + lint-staged
25. Configurar pre-commit hook

---

## 4. RESUMEN DE RIESGO

| Config | Riesgo | Acción |
|--------|--------|--------|
| `ignoreBuildErrors: true` | CRÍTICO | Eliminar (fase 3, después de arreglar errores) |
| `ignoreDuringBuilds: true` | ALTO | Eliminar (fase 3) |
| `@types/react@18` con React 19 | ALTO | Actualizar a @19 (fase 1) |
| Dos lock files | MEDIO | Borrar package-lock.json (fase 1) |
| `latest` en deps | MEDIO | Fijar versiones (fase 1) |
| `allowJs: true` sin .js | BAJO | Cambiar a false (fase 1) |
| `target: "ES6"` | BAJO | Cambiar a ES2017 (fase 1) |
| Sin ESLint | MEDIO | Configurar (fase 1) |
| Sin Prettier | BAJO | Configurar (fase 1) |
| Sin CI | ALTO | Crear workflow (fase 5) |
| Deps duplicadas | BAJO | Limpiar (fase 6) |
