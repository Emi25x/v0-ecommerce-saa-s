"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { FileText as FeatherFileText, Upload as FeatherUpload } from "react-feather" // Importing FileText and Upload components from react-feather
import { LogoutButton } from "@/components/logout-button"
import { UserDisplay } from "@/components/user-display"

// Inline SVG components
const Package = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
)

const ShoppingCart = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </svg>
)

const ShoppingBag = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M6 2 3 6v14a2 2 0 0 0-2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
)

const Truck = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="17" cy="18" r="2" />
    <circle cx="7" cy="18" r="2" />
  </svg>
)

const Settings = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const ChevronDown = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const CreditCard = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </svg>
)

const Target = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

const Database = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </svg>
)

export function AppSidebar() {
  const pathname = usePathname()
  const [mlExpanded, setMlExpanded] = useState(true)
  const [inventoryExpanded, setInventoryExpanded] = useState(true) // Estado para Base de Productos
  const [integrationsExpanded, setIntegrationsExpanded] = useState(true) // Declaring integrationsExpanded state

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
        <a
          href="/"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
            isActive("/")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <Package className="h-5 w-5" />
          <span className="font-medium">Dashboard</span>
        </a>

        <div className="mt-2">
          <button
            onClick={() => setMlExpanded(!mlExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
              </svg>
              <span className="font-medium">Mercado Libre</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${mlExpanded ? "rotate-180" : ""}`} />
          </button>

          {mlExpanded && (
            <div className="ml-8 mt-1 flex flex-col gap-1">
              <a
                href="/products"
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/products")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShoppingCart className="h-4 w-4" />
                  <span>Publicaciones</span>
                </div>
                {notifications?.products > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-semibold text-white">
                    {notifications.products}
                  </span>
                )}
              </a>
              <a
                href="/orders"
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/orders")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="h-4 w-4" />
                  <span>Ventas</span>
                </div>
                {notifications?.orders > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-semibold text-white">
                    {notifications.orders}
                  </span>
                )}
              </a>
              <a
                href="/shipments"
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/shipments")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Truck className="h-4 w-4" />
                  <span>Envíos</span>
                </div>
                {notifications?.shipments > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-semibold text-white">
                    {notifications.shipments}
                  </span>
                )}
              </a>
              <a
                href="/pagos"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/pagos")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <CreditCard className="h-4 w-4" />
                <span>Pagos</span>
              </a>
              <a
                href="/competition"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/competition")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Target className="h-4 w-4" />
                <span>Competencia</span>
              </a>
              <div className="my-2 border-t border-sidebar-border" />
              <a
                href="/ml/importer"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/importer")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Database className="h-4 w-4" />
                <span>Importación inicial</span>
              </a>
              <a
                href="/ml/products/build"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/products/build")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M12 8v8m-4-4h8" />
                </svg>
                <span>Crear productos</span>
              </a>
              <a
                href="/ml/matcher"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/matcher")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                  <rect width="4" height="12" x="2" y="9" />
                  <circle cx="4" cy="4" r="2" />
                </svg>
                <span>Vinculación</span>
              </a>
              <div className="my-2 border-t border-sidebar-border" />
              <a
                href="/ml/daily-actions"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/daily-actions")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                </svg>
                <span>Centro Diario</span>
              </a>
              <a
                href="/ml/pricing-intel"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/pricing-intel")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
                <span>Pricing Intel</span>
              </a>
              <a
                href="/ml/opportunities"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/opportunities")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>Oportunidades</span>
              </a>
              <a
                href="/ml/catalog"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/catalog")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3h18v4H3z" />
                  <path d="M3 10h18v4H3z" />
                  <path d="M3 17h18v4H3z" />
                </svg>
                <span>Migrar a Catálogo</span>
              </a>
              <a
                href="/ml/catalog-optin"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/ml/catalog-optin")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
                <span>Optin Catálogo</span>
              </a>
            </div>
          )}
        </div>

        <div className="mt-2">
          <button
            onClick={() => setInventoryExpanded(!inventoryExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5" />
              <span className="font-medium">Base de Productos</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${inventoryExpanded ? "rotate-180" : ""}`} />
          </button>

          {inventoryExpanded && (
            <div className="ml-8 mt-1 flex flex-col gap-1">
              <a
                href="/inventory"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/inventory")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Productos</span>
              </a>
              <a
                href="/inventory/sources"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/inventory/sources")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Database className="h-4 w-4" />
                <span>Fuentes</span>
              </a>
              <a
                href="/inventory/sources/new"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/inventory/sources/new")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M12 8v8m-4-4h8" />
                </svg>
                <span>Nueva fuente</span>
              </a>
              <a
                href="/inventory/sources/batch-import"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/inventory/sources/batch-import")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherUpload className="h-4 w-4" />
                <span>Importación inicial</span>
              </a>
              <a
                href="/suppliers"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/suppliers")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Truck className="h-4 w-4" />
                <span>Proveedores</span>
              </a>
              <a
                href="/warehouses"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/warehouses")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span>Almacenes</span>
              </a>
            </div>
          )}
        </div>

        <div className="mt-2">
          <button
            onClick={() => setIntegrationsExpanded(!integrationsExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5" />
              <span className="font-medium">Integraciones</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${integrationsExpanded ? "rotate-180" : ""}`} />
          </button>

          {integrationsExpanded && (
            <div className="ml-8 mt-1 flex flex-col gap-1">
              <a
                href="/integrations"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/integrations"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Configuracion</span>
              </a>
              <a
                href="/integrations/ml-templates"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/integrations/ml-templates"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherFileText className="h-4 w-4" />
                <span>Plantillas y Precios</span>
              </a>
              <a
                href="/integrations/ml-publish"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/integrations/ml-publish"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherUpload className="h-4 w-4" />
                <span>Publicar en ML</span>
              </a>
              <a
                href="/settings/reports"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/settings/reports"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherFileText className="h-4 w-4" />
                <span>Reportes de Ventas</span>
              </a>
            </div>
          )}
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
