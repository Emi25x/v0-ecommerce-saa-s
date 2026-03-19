"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
import { LogoutButton } from "@/components/layout/logout-button"
import { UserDisplay } from "@/components/layout/user-display"
import { SidebarSection } from "@/components/layout/sidebar-section"
import { SidebarLink } from "@/components/layout/sidebar-link"

// ML brand logo (not available in lucide-react)
const MLLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
  </svg>
)

export function AppSidebar() {
  const pathname = usePathname()
  const [lastVisits, setLastVisits] = useState({
    orders: null as string | null,
    products: null as string | null,
    shipments: null as string | null,
  })

  const [notifications, setNotifications] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLastVisits({
        orders: localStorage.getItem("lastVisit_orders"),
        products: localStorage.getItem("lastVisit_products"),
        shipments: localStorage.getItem("lastVisit_shipments"),
      })
    }
  }, [])

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const url = `/api/notifications?lastVisitOrders=${lastVisits.orders || ""}&lastVisitProducts=${lastVisits.products || ""}&lastVisitShipments=${lastVisits.shipments || ""}`
        const res = await fetch(url)
        if (!res.ok) {
          console.error("[v0] Failed to fetch notifications, status:", res.status)
          return
        }
        const data = await res.json()
        setNotifications(data)
      } catch (error) {
        console.error("[v0] Failed to fetch notifications:", error)
      }
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [lastVisits.orders, lastVisits.products, lastVisits.shipments])

  useEffect(() => {
    const now = new Date().toISOString()
    if (pathname === "/orders") {
      localStorage.setItem("lastVisit_orders", now)
      setLastVisits((prev) => ({ ...prev, orders: now }))
    } else if (pathname === "/products") {
      localStorage.setItem("lastVisit_products", now)
      setLastVisits((prev) => ({ ...prev, products: now }))
    } else if (pathname === "/shipments") {
      localStorage.setItem("lastVisit_shipments", now)
      setLastVisits((prev) => ({ ...prev, shipments: now }))
    }
  }, [pathname])

  const isActive = (path: string) => pathname === path

  return (
    <aside className="w-64 border-r border-border bg-sidebar">
      <nav className="flex flex-col gap-1 p-4">
        <Link
          href="/"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
            isActive("/")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <Package className="h-5 w-5" />
          <span className="font-medium">Dashboard</span>
        </Link>

        {/* ── Mercado Libre ── */}
        <SidebarSection label="Mercado Libre" icon={MLLogo}>
          {/* Principal */}
          <SidebarLink
            href="/ml/publications"
            label="Publicaciones"
            icon={ShoppingCart}
            badge={notifications?.products}
            badgeColor="bg-blue-500"
          />
          <SidebarLink href="/ml/publications-alerts" label="Alertas" icon={Bell} match="exact" />
          <SidebarLink
            href="/ml/orders"
            label="Ventas"
            icon={ShoppingBag}
            badge={notifications?.orders}
            badgeColor="bg-green-500"
          />
          <SidebarLink
            href="/ml/shipments"
            label="Envíos"
            icon={Truck}
            badge={notifications?.shipments}
            badgeColor="bg-orange-500"
          />
          <SidebarLink href="/ml/payments" label="Pagos" icon={CreditCard} />
          <SidebarLink href="/ml/accounts" label="Cuentas" icon={Settings} />

          {/* Sincronización */}
          <div className="my-2 border-t border-sidebar-border" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Sincronización
          </p>
          <SidebarLink href="/ml/importer" label="Importación inicial" icon={Database} />
          <SidebarLink href="/ml/import-pro" label="Import Pro" icon={Upload} />
          <SidebarLink href="/ml/sync" label="Sincronización" icon={RefreshCw} />

          {/* Catálogo */}
          <div className="my-2 border-t border-sidebar-border" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Catálogo
          </p>
          <SidebarLink href="/ml/catalog/eligibility" label="Elegibilidad" icon={CheckCircle2} />
          <SidebarLink href="/ml/catalog/optin" label="Opt-in" icon={Plus} />
          <SidebarLink href="/ml/catalog/migration" label="Migración" icon={ArrowRight} />

          {/* Inteligencia */}
          <div className="my-2 border-t border-sidebar-border" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Inteligencia
          </p>
          <SidebarLink href="/ml/priorities" label="Prioridades de publicación" icon={BarChart3} />

          {/* Operativo */}
          <div className="my-2 border-t border-sidebar-border" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Operativo
          </p>
          <SidebarLink href="/ml/matcher" label="Vinculación" icon={Link2} />
          <SidebarLink href="/ml/products/build" label="Crear productos" icon={PlusSquare} />
          <SidebarLink href="/ml/products/unmatched" label="Sin vincular" icon={XCircle} />
        </SidebarSection>

        {/* ── Shopify ── */}
        <SidebarSection label="Shopify" icon={ShoppingBag}>
          <SidebarLink href="/shopify/products" label="Productos" icon={Package} />
          <SidebarLink href="/shopify/orders" label="Ventas" icon={ShoppingBag} />
          <SidebarLink href="/shopify/sync" label="Sincronización" icon={RefreshCw} />
          <SidebarLink href="/shopify/config" label="Exportar a Shopify" icon={FileSpreadsheet} />
          <SidebarLink href="/integrations/shopify-stores" label="Tiendas" icon={Settings} />
        </SidebarSection>

        {/* ── Base de Productos ── */}
        <SidebarSection label="Base de Productos" icon={Database}>
          <SidebarLink href="/inventory" label="Productos" icon={Package} match="exact" />
          <SidebarLink href="/inventory/stock" label="Stock General" icon={LayoutGrid} />
          <SidebarLink href="/inventory/sources" label="Fuentes" icon={Database} match="exact" />
          <SidebarLink href="/inventory/sources/new" label="Nueva fuente" icon={PlusSquare} match="exact" />
          <SidebarLink href="/inventory/sources/batch-import" label="Importación inicial" icon={Upload} />
          <SidebarLink href="/suppliers" label="Proveedores" icon={Truck} match="exact" />
          <SidebarLink href="/warehouses" label="Almacenes" icon={Home} match="exact" />
        </SidebarSection>

        {/* ── Integraciones ── */}
        <SidebarSection label="Integraciones" icon={Settings}>
          <SidebarLink href="/integrations" label="Configuración" icon={Settings} match="exact" />
          <SidebarLink href="/integrations/ml-templates" label="Plantillas y Precios" icon={FileText} match="exact" />
          <SidebarLink href="/integrations/ml-publish" label="Publicar en ML" icon={Upload} match="exact" />
          <SidebarLink href="/settings/reports" label="Reportes de Ventas" icon={FileText} match="exact" />
        </SidebarSection>

        {/* ── Precios ── */}
        <SidebarSection label="Precios" icon={CircleDollarSign}>
          <SidebarLink href="/pricing" label="Resumen" icon={LayoutGrid} match="exact" />
          <SidebarLink href="/pricing/lists" label="Listas" icon={ClipboardList} />
          <SidebarLink href="/pricing/exchange-rates" label="Tipos de cambio" icon={ArrowLeftRight} />
          <SidebarLink href="/pricing/calculator" label="Calculadora" icon={Calculator} />
          <SidebarLink href="/pricing/results" label="Resultados" icon={Activity} />
        </SidebarSection>

        {/* ── Radar Editorial ── */}
        <SidebarSection label="Radar Editorial" icon={Radar}>
          <SidebarLink href="/radar" label="Dashboard" icon={Radar} match="exact" />
          <SidebarLink href="/radar/oportunidades" label="Oportunidades" icon={Zap} />
          <SidebarLink href="/radar/tendencias" label="Tendencias" icon={TrendingUp} />
          <SidebarLink href="/radar/huecos" label="Huecos de mercado" icon={AlertCircle} />
          <SidebarLink href="/radar/adaptaciones" label="Adaptaciones" icon={Edit3} match="exact" />
          <SidebarLink href="/radar/adaptaciones-tempranas" label="Adaptaciones tempranas" icon={Flag} />
          <SidebarLink href="/radar/volver-a-pedir" label="Volver a pedir" icon={Gift} />
          <SidebarLink href="/radar/config" label="Configuración" icon={Settings} />
        </SidebarSection>

        {/* ── Envíos ── */}
        <SidebarSection label="Envíos" icon={Truck}>
          <SidebarLink href="/envios" label="Panel" icon={LayoutGrid} match="exact" />
          <SidebarLink href="/envios/remitentes" label="Remitentes" icon={User} />
          <SidebarLink href="/envios/transportistas" label="Transportistas" icon={Truck} />
        </SidebarSection>

        {/* ── Facturación ── */}
        <div className="mt-2">
          <Link
            href="/billing"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
              isActive("/billing")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Receipt className="h-5 w-5" />
            <span className="font-medium">Facturación</span>
          </Link>
          <div className="ml-8 mt-1 flex flex-col gap-1">
            <SidebarLink href="/billing/mercadolibre" label="Ventas ML" icon={MLLogo} />
            <SidebarLink href="/billing/shopify" label="Ventas Shopify" icon={ShoppingBag} />
          </div>
        </div>

        {/* ── Atención al Cliente ── */}
        <SidebarSection label="Atención al Cliente" icon={MessageSquare}>
          <SidebarLink href="/atencion/inbox" label="Bandeja unificada" icon={Inbox} />
          <SidebarLink href="/atencion/ml-preguntas" label="Preguntas ML" icon={MLLogo} />
          <SidebarLink href="/atencion/config" label="Configuración" icon={Settings} />
        </SidebarSection>

        {/* ── Marketing ── */}
        <div className="px-3 py-1">
          <SidebarSection label="Marketing" icon={Activity}>
            <SidebarLink href="/marketing" label="Dashboard" icon={LayoutGrid} match="exact" />
            <SidebarLink href="/marketing/google" label="Google Marketing" icon={Search} />
            <SidebarLink href="/marketing/meta" label="Meta Ads" icon={Facebook} />
            <SidebarLink href="/marketing/tiktok" label="TikTok Ads" icon={Music} />
            <SidebarLink href="/marketing/email" label="Email Marketing" icon={Mail} />
            <SidebarLink href="/marketing/config" label="Configuración" icon={Settings} />
          </SidebarSection>
        </div>
      </nav>

      {/* Usuario y logout al final del sidebar */}
      <div className="mt-auto border-t border-sidebar-border">
        <UserDisplay />
        <div className="p-4 pt-2">
          <LogoutButton />
        </div>
      </div>
    </aside>
  )
}
