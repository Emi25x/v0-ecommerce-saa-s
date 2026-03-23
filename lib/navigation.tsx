import type { LucideIcon } from "lucide-react"
import {
  Package,
  ShoppingCart,
  ShoppingBag,
  Truck,
  Settings,
  CreditCard,
  Receipt,
  Database,
  FileSpreadsheet,
  FileText,
  Upload,
  Bell,
  RefreshCw,
  CheckCircle2,
  Plus,
  ArrowRight,
  BarChart3,
  Link2,
  PlusSquare,
  XCircle,
  LayoutGrid,
  Home,
  User,
  MessageSquare,
  Inbox,
  Activity,
  Search,
  Music,
  Mail,
  CircleDollarSign,
  ClipboardList,
  ArrowLeftRight,
  Calculator,
  Zap,
  TrendingUp,
  AlertCircle,
  Edit3,
  Flag,
  Gift,
  Radar,
  Facebook,
} from "lucide-react"

// ── Types ──

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon | React.ComponentType<{ className?: string }>
  match?: "exact" | "prefix"
  /** Key in notifications object for badge count */
  badgeKey?: string
  badgeColor?: string
}

export interface NavSubgroup {
  label: string
  items: NavItem[]
}

/**
 * Module visibility levels:
 * - "core"     → visible, fully functional
 * - "beta"     → visible with "Beta" badge, functional but incomplete
 * - "internal" → hidden from navigation, routes still work
 */
export type ModuleVisibility = "core" | "beta" | "internal"

export interface NavSection {
  id: string
  label: string
  icon: LucideIcon | React.ComponentType<{ className?: string }>
  items?: NavItem[]
  subgroups?: NavSubgroup[]
  /** If true, render as a flat link instead of collapsible section */
  flat?: boolean
  flatHref?: string
  /** Child links shown indented below the flat link */
  children?: NavItem[]
  /** Module visibility level. Defaults to "core" if omitted. */
  visibility?: ModuleVisibility
}

// ── ML brand logo (not in lucide-react) ──

export const MLLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
  </svg>
)

// ── Navigation definition ──

export const navigation: NavSection[] = [
  // ── Mercado Libre ──
  {
    id: "ml",
    label: "Mercado Libre",
    icon: MLLogo,
    items: [
      { href: "/ml/publications", label: "Publicaciones", icon: ShoppingCart, badgeKey: "products", badgeColor: "bg-blue-500" },
      { href: "/ml/publications-alerts", label: "Alertas", icon: Bell, match: "exact" },
      { href: "/ml/orders", label: "Ventas", icon: ShoppingBag, badgeKey: "orders", badgeColor: "bg-green-500" },
      { href: "/ml/shipments", label: "Envíos", icon: Truck, badgeKey: "shipments", badgeColor: "bg-orange-500" },
      { href: "/ml/payments", label: "Pagos", icon: CreditCard },
      { href: "/ml/accounts", label: "Cuentas", icon: Settings },
    ],
    subgroups: [
      {
        label: "Sincronización",
        items: [
          { href: "/ml/importer", label: "Importación inicial", icon: Database },
          { href: "/ml/import-pro", label: "Import Pro", icon: Upload },
          { href: "/ml/sync", label: "Sincronización", icon: RefreshCw },
        ],
      },
      {
        label: "Catálogo",
        items: [
          { href: "/ml/catalog/eligibility", label: "Elegibilidad", icon: CheckCircle2 },
          { href: "/ml/catalog/optin", label: "Opt-in", icon: Plus },
          { href: "/ml/catalog/migration", label: "Migración", icon: ArrowRight },
        ],
      },
      {
        label: "Inteligencia",
        items: [
          { href: "/ml/priorities", label: "Prioridades de publicación", icon: BarChart3 },
        ],
      },
      {
        label: "Operativo",
        items: [
          { href: "/ml/matcher", label: "Vinculación", icon: Link2 },
          { href: "/ml/products/build", label: "Crear productos", icon: PlusSquare },
          { href: "/ml/products/unmatched", label: "Sin vincular", icon: XCircle },
        ],
      },
    ],
  },

  // ── Shopify ──
  {
    id: "shopify",
    label: "Shopify",
    icon: ShoppingBag,
    items: [
      { href: "/shopify/products", label: "Productos", icon: Package },
      { href: "/shopify/orders", label: "Ventas", icon: ShoppingBag },
      { href: "/shopify/sync", label: "Sincronización", icon: RefreshCw },
      { href: "/shopify/config", label: "Exportar a Shopify", icon: FileSpreadsheet },
      { href: "/integrations/shopify-stores", label: "Tiendas", icon: Settings },
    ],
  },

  // ── Base de Productos ──
  {
    id: "inventory",
    label: "Base de Productos",
    icon: Database,
    items: [
      { href: "/inventory", label: "Productos", icon: Package, match: "exact" },
      { href: "/inventory/stock", label: "Stock General", icon: LayoutGrid },
      { href: "/inventory/sources", label: "Fuentes", icon: Database, match: "exact" },
      { href: "/inventory/sources/new", label: "Nueva fuente", icon: PlusSquare, match: "exact" },
      { href: "/inventory/sources/batch-import", label: "Importación inicial", icon: Upload },
      { href: "/suppliers", label: "Proveedores", icon: Truck, match: "exact" },
      { href: "/warehouses", label: "Almacenes", icon: Home, match: "exact" },
      { href: "/publication/candidates", label: "Candidatos publicación", icon: CheckCircle2, match: "exact" },
    ],
  },

  // ── Integraciones ──
  {
    id: "integrations",
    label: "Integraciones",
    icon: Settings,
    items: [
      { href: "/integrations", label: "Configuración", icon: Settings, match: "exact" },
      { href: "/integrations/ml-templates", label: "Plantillas y Precios", icon: FileText, match: "exact" },
      { href: "/integrations/ml-publish", label: "Publicar en ML", icon: Upload, match: "exact" },
      { href: "/settings/reports", label: "Reportes de Ventas", icon: FileText, match: "exact" },
    ],
  },

  // ── Precios ──
  {
    id: "pricing",
    label: "Precios",
    icon: CircleDollarSign,
    items: [
      { href: "/pricing", label: "Resumen", icon: LayoutGrid, match: "exact" },
      { href: "/pricing/lists", label: "Listas", icon: ClipboardList },
      { href: "/pricing/exchange-rates", label: "Tipos de cambio", icon: ArrowLeftRight },
      { href: "/pricing/calculator", label: "Calculadora", icon: Calculator },
      { href: "/pricing/results", label: "Resultados", icon: Activity },
    ],
  },

  // ── Radar Editorial ── (internal: módulo en desarrollo, no listo para usuario)
  {
    id: "radar",
    label: "Radar Editorial",
    icon: Radar,
    visibility: "internal",
    items: [
      { href: "/radar", label: "Dashboard", icon: Radar, match: "exact" },
      { href: "/radar/oportunidades", label: "Oportunidades", icon: Zap },
      { href: "/radar/tendencias", label: "Tendencias", icon: TrendingUp },
      { href: "/radar/huecos", label: "Huecos de mercado", icon: AlertCircle },
      { href: "/radar/adaptaciones", label: "Adaptaciones", icon: Edit3, match: "exact" },
      { href: "/radar/adaptaciones-tempranas", label: "Adaptaciones tempranas", icon: Flag },
      { href: "/radar/volver-a-pedir", label: "Volver a pedir", icon: Gift },
      { href: "/radar/config", label: "Configuración", icon: Settings },
    ],
  },

  // ── Envíos ──
  {
    id: "envios",
    label: "Envíos",
    icon: Truck,
    items: [
      { href: "/envios", label: "Panel", icon: LayoutGrid, match: "exact" },
      { href: "/envios/remitentes", label: "Remitentes", icon: User },
      { href: "/envios/transportistas", label: "Transportistas", icon: Truck },
    ],
  },

  // ── Facturación (flat link with children) ──
  {
    id: "billing",
    label: "Facturación",
    icon: Receipt,
    flat: true,
    flatHref: "/billing",
    children: [
      { href: "/billing/mercadolibre", label: "Ventas ML", icon: MLLogo },
      { href: "/billing/shopify", label: "Ventas Shopify", icon: ShoppingBag },
    ],
  },

  // ── Atención al Cliente ── (beta: preguntas ML funciona, inbox parcial)
  {
    id: "atencion",
    label: "Atención al Cliente",
    icon: MessageSquare,
    visibility: "beta",
    items: [
      { href: "/atencion/inbox", label: "Bandeja unificada", icon: Inbox },
      { href: "/atencion/ml-preguntas", label: "Preguntas ML", icon: MLLogo },
      { href: "/atencion/config", label: "Configuración", icon: Settings },
    ],
  },

  // ── Marketing ── (internal: 15+ plataformas en desarrollo, no listo)
  {
    id: "marketing",
    label: "Marketing",
    icon: Activity,
    visibility: "internal",
    items: [
      { href: "/marketing", label: "Dashboard", icon: LayoutGrid, match: "exact" },
      { href: "/marketing/google", label: "Google Marketing", icon: Search },
      { href: "/marketing/meta", label: "Meta Ads", icon: Facebook },
      { href: "/marketing/tiktok", label: "TikTok Ads", icon: Music },
      { href: "/marketing/email", label: "Email Marketing", icon: Mail },
      { href: "/marketing/config", label: "Configuración", icon: Settings },
    ],
  },
]

/**
 * Returns only sections visible to the user (core + beta).
 * Internal sections are filtered out — their routes still work,
 * they just don't appear in navigation.
 */
export function getVisibleNavigation(): NavSection[] {
  return navigation.filter((s) => (s.visibility ?? "core") !== "internal")
}
