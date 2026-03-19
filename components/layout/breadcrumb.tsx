"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"

/** Human-readable labels for route segments */
const SEGMENT_LABELS: Record<string, string> = {
  // Top-level
  ml: "Mercado Libre",
  shopify: "Shopify",
  inventory: "Inventario",
  integrations: "Integraciones",
  pricing: "Precios",
  radar: "Radar Editorial",
  envios: "Envíos",
  billing: "Facturación",
  atencion: "Atención al Cliente",
  marketing: "Marketing",
  suppliers: "Proveedores",
  warehouses: "Almacenes",
  orders: "Pedidos",
  shipments: "Envíos",
  settings: "Configuración",
  pagos: "Pagos",
  webhooks: "Webhooks",

  // Sub-segments
  publications: "Publicaciones",
  "publications-alerts": "Alertas",
  accounts: "Cuentas",
  sync: "Sincronización",
  config: "Configuración",
  products: "Productos",
  push: "Publicar",
  importer: "Importación",
  "import-pro": "Import Pro",
  catalog: "Catálogo",
  eligibility: "Elegibilidad",
  optin: "Opt-in",
  migration: "Migración",
  priorities: "Prioridades",
  matcher: "Vinculación",
  build: "Crear",
  unmatched: "Sin vincular",
  stock: "Stock",
  sources: "Fuentes",
  "batch-import": "Importación inicial",
  "ml-templates": "Plantillas ML",
  "ml-publish": "Publicar en ML",
  reports: "Reportes",
  lists: "Listas",
  "exchange-rates": "Tipos de cambio",
  calculator: "Calculadora",
  results: "Resultados",
  oportunidades: "Oportunidades",
  tendencias: "Tendencias",
  huecos: "Huecos de mercado",
  adaptaciones: "Adaptaciones",
  "adaptaciones-tempranas": "Adaptaciones tempranas",
  "volver-a-pedir": "Volver a pedir",
  remitentes: "Remitentes",
  transportistas: "Transportistas",
  cotizador: "Cotizador",
  mercadolibre: "Mercado Libre",
  inbox: "Bandeja",
  "ml-preguntas": "Preguntas ML",
  google: "Google",
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  email: "Email",
  "shopify-stores": "Tiendas Shopify",
  history: "Historial",
  new: "Nuevo",
}

function labelFor(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
}

export function Breadcrumb() {
  const pathname = usePathname()

  if (!pathname || pathname === "/") return null

  const segments = pathname.split("/").filter(Boolean)
  // Skip UUID-like segments from breadcrumb display
  const displaySegments = segments.filter((s) => !/^[0-9a-f]{8}-/.test(s))

  if (displaySegments.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {displaySegments.map((segment, index) => {
        const href = "/" + segments.slice(0, segments.indexOf(segment) + 1).join("/")
        const isLast = index === displaySegments.length - 1

        return (
          <span key={href} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {isLast ? (
              <span className="font-medium text-foreground">{labelFor(segment)}</span>
            ) : (
              <Link href={href} className="hover:text-foreground transition-colors">
                {labelFor(segment)}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
