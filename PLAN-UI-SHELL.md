# Plan: UI Shell Profesional — Auditoría y Refactor

## 1. Hallazgos (problemas detectados)

### 1.1 `app/layout.tsx` — Root Layout
- **`generator: "v0.app"`** en metadata → delata origen v0, no profesional
- **Título genérico** "Ecommerce Manager" → sin nombre de producto/marca
- **`MigrationProvider`** es un passthrough vacío (solo renderiza children) → dead code
- **`html class="dark"` hardcodeado** → no permite cambio de tema a pesar de tener `theme-provider.tsx`
- **No usa `ThemeProvider`** de next-themes (existe en `components/layout/theme-provider.tsx` pero no se usa)
- **No hay viewport/favicon/manifest** metadata

### 1.2 `app/(dashboard)/layout.tsx` — Dashboard Layout
- **`"use client"` innecesario** — solo compone `<AppSidebar>` + `<main>`, podría ser Server Component
- **No hay header/topbar** — el dashboard no tiene breadcrumbs, search global, ni user menu
- **No hay contenedor para scroll** — el `<main>` es bare, no tiene padding/overflow consistente
- **`Suspense fallback={null}`** — sin skeleton ni loading state visible

### 1.3 `components/layout/app-sidebar.tsx` — Sidebar (299 líneas)
- **Mega-componente con 3 responsabilidades mezcladas:**
  1. Navegación (40+ links hardcodeados)
  2. Notifications fetching (polling cada 30s con `setInterval`)
  3. Last-visit tracking (localStorage read/write)
- **48 imports de iconos Lucide** — señal de archivo demasiado grande
- **Notifications fetch acoplado** al sidebar en vez de un provider/hook global
- **`localStorage` access directo** — debería ser un hook (`useLastVisits`)
- **`[v0]` en console.error** — marca de v0 en logs de producción
- **Inconsistencia en Facturación y Marketing** — no usan `<SidebarSection>`, tienen markup manual
- **Sin scroll** — si el sidebar es más alto que el viewport, no hay `overflow-y-auto`
- **Sin branding/logo** en la parte superior del sidebar
- **Sin collapsible** — no se puede minimizar el sidebar en mobile/desktop

### 1.4 `app/(dashboard)/page.tsx` — Dashboard Home
- **`"use client"` con 5 `useState` + 2 `useEffect`** → todo el fetching debería ser server-side o SWR
- **100% acoplado a ML** — el dashboard solo muestra cuentas ML e importación ML
- **No muestra métricas clave del negocio**: stock total, pedidos del día, envíos pendientes, facturación
- **`bg-white` hardcodeado en header** → rompe dark mode
- **Header duplicado** — cada page tiene su propio `<header>`, no hay header compartido
- **Links rotos**: `/settings/accounts` y `/ml/unmatched` pueden no existir
- **`any` types en todos los states** — sin tipado

### 1.5 `components/layout/user-display.tsx`
- **Fetch de usuario en cliente** — podría obtenerse del server en el layout
- **`createClient()` en cada render** — ineficiente, debería ser singleton o hook

### 1.6 Componentes legacy/dead code
- **`MigrationProvider`** — passthrough vacío, eliminar
- **`components/layout/sidebar-nav.tsx`** — legacy, no usado
- **`components/layout/conditional-sidebar.tsx`** — no referenciado desde layouts

---

## 2. Propuesta de App Shell Profesional

### 2.1 Metadata Final

```tsx
// app/layout.tsx
export const metadata: Metadata = {
  title: {
    default: "Nexo Commerce",
    template: "%s | Nexo Commerce",
  },
  description: "Plataforma de gestión e-commerce multi-canal. Centraliza inventario, pedidos, envíos y facturación.",
  // Sin generator v0
}
```

> Nota: "Nexo Commerce" es un nombre provisional. Si ya tenés nombre de marca, reemplazar.

### 2.2 Estructura del Shell

```
┌─────────────────────────────────────────────────┐
│ RootLayout (Server)                             │
│  └─ ThemeProvider (next-themes)                 │
│     └─ Toaster                                  │
│                                                 │
│  ┌──────────┬──────────────────────────────────┐│
│  │ Sidebar  │ TopBar                           ││
│  │ (nav)    │ [breadcrumb] [search] [user-menu]││
│  │          ├──────────────────────────────────┤│
│  │          │ <main> (scrollable)              ││
│  │          │   page content                   ││
│  │          │                                  ││
│  └──────────┴──────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### 2.3 Estructura de Componentes

```
components/layout/
├── app-sidebar.tsx          # Sidebar container (logo + nav + footer)
├── sidebar-nav.tsx          # Navigation links (data-driven)
├── sidebar-nav-section.tsx  # Collapsible section (rename de sidebar-section)
├── sidebar-nav-link.tsx     # Individual link (rename de sidebar-link)
├── topbar.tsx               # Header bar: breadcrumb + actions + user menu
├── breadcrumb.tsx           # Auto-breadcrumb from pathname
├── user-menu.tsx            # Dropdown: email + settings + logout
├── logo.tsx                 # Brand logo/wordmark
├── page-header.tsx          # Reusable page header (title + description + actions)
└── theme-provider.tsx       # next-themes (ya existe)
```

### 2.4 Cambios Concretos

#### A) Root Layout (`app/layout.tsx`)
- Eliminar `generator: "v0.app"` de metadata
- Cambiar título a pattern con template
- Eliminar `MigrationProvider` (dead code)
- Agregar `ThemeProvider` de next-themes
- Quitar `class="dark"` hardcodeado (next-themes lo maneja)

#### B) Dashboard Layout (`app/(dashboard)/layout.tsx`)
- Quitar `"use client"` — hacerlo Server Component
- Agregar `<Topbar />` entre sidebar y content
- Agregar `overflow-y-auto` al main
- Agregar `Suspense` con skeleton fallback

#### C) Sidebar — Refactor en 3 pasos

**Paso 1: Extraer datos de navegación**
```tsx
// lib/navigation.ts — configuración declarativa
export const navigation: NavSection[] = [
  {
    id: "ml",
    label: "Mercado Libre",
    icon: "ml-logo",
    items: [
      { href: "/ml/publications", label: "Publicaciones", icon: "ShoppingCart", badge: "notifications.products" },
      // ...
    ],
    subsections: [
      { label: "Sincronización", items: [...] },
      { label: "Catálogo", items: [...] },
    ]
  },
  // ...
]
```

**Paso 2: Extraer lógica a hooks**
```tsx
// hooks/use-notifications.ts — polling global
// hooks/use-last-visits.ts — localStorage tracking
```

**Paso 3: Sidebar limpio**
```tsx
export function AppSidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r">
      <div className="p-4"><Logo /></div>
      <ScrollArea className="flex-1">
        <SidebarNav />
      </ScrollArea>
      <div className="border-t p-4">
        <UserMenu />
      </div>
    </aside>
  )
}
```

#### D) Dashboard Home — Reescritura
- Convertir a Server Component con datos pre-fetched
- Mostrar KPIs del negocio: productos, stock, pedidos, envíos, facturación
- Quick actions grid por módulo
- Actividad reciente (process_runs)
- Quitar acoplamiento a ML

#### E) `<PageHeader>` compartido
```tsx
// Uso en cada page:
<PageHeader
  title="Inventario"
  description="Gestión de productos y stock"
  actions={<Button>Importar</Button>}
/>
```
Reemplaza los `<header>` ad-hoc en cada página.

#### F) Limpieza
- Eliminar `MigrationProvider`
- Eliminar `sidebar-nav.tsx` legacy
- Eliminar `conditional-sidebar.tsx` si no se usa
- Eliminar `[v0]` de todos los `console.error`
- Eliminar `bg-white` hardcodeados (usar `bg-background`)

---

## 3. Convenciones UI Propuestas

| Aspecto | Convención |
|---------|-----------|
| Page title | `<PageHeader title="..." />` — consistente en todas las páginas |
| Metadata | `export const metadata = { title: "Inventario" }` — usa template del root |
| Spacing | `p-6 space-y-6` en contenido principal |
| Cards | `<Card>` para cada sección, nunca divs sueltos |
| Tables | `<DataTable>` con sorting, pagination, column selector |
| Loading | `loading.tsx` con skeletons, no spinners |
| Empty states | Ilustración + texto + CTA consistente |
| Badges | Colores semánticos: blue=info, green=success, yellow=warning, red=error |
| Colors | Solo `bg-background`, `text-foreground`, etc. — nunca `bg-white`/`text-black` |
| Fetch data | Server Components o SWR hooks — nunca `useEffect` + `fetch` directo |
| Forms | React Hook Form + Zod — sin estado manual de forms |

---

## 4. Orden de Implementación

| # | Tarea | Impacto | Riesgo |
|---|-------|---------|--------|
| 1 | Fix metadata (quitar v0, agregar template) | Alto | Bajo |
| 2 | Eliminar MigrationProvider | Bajo | Bajo |
| 3 | Crear `<PageHeader>` compartido | Alto | Bajo |
| 4 | Crear `<Topbar>` con breadcrumb + user menu | Alto | Medio |
| 5 | Refactor sidebar: extraer nav data + hooks | Alto | Medio |
| 6 | Reescribir dashboard home con KPIs reales | Alto | Medio |
| 7 | Agregar ThemeProvider + quitar dark hardcodeado | Medio | Bajo |
| 8 | Limpiar dead code y marcas v0 | Medio | Bajo |
