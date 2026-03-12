"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
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

const Receipt = (props: React.SVGProps<SVGSVGElement>) => (
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
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M14 8H8" />
    <path d="M16 12H8" />
    <path d="M13 16H8" />
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

const FileSpreadsheet = (props: React.SVGProps<SVGSVGElement>) => (
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
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M8 13h2" />
    <path d="M14 13h2" />
    <path d="M8 17h2" />
    <path d="M14 17h2" />
  </svg>
)

export function AppSidebar() {
  const pathname = usePathname()
  const [mlExpanded, setMlExpanded] = useState(true)
  const [shopifyExpanded, setShopifyExpanded] = useState(true)
  const [inventoryExpanded, setInventoryExpanded] = useState(true)
  const [integrationsExpanded, setIntegrationsExpanded] = useState(true)
  const [pricingExpanded, setPricingExpanded] = useState(true)
  const [radarExpanded, setRadarExpanded]     = useState(true)
  const [enviosExpanded, setEnviosExpanded]   = useState(true)

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

              {/* ── Principal ── */}
              <Link
                href="/ml/publications"
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/publications") && !pathname?.startsWith("/ml/publications-alerts")
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
              </Link>
              <Link
                href="/ml/publications-alerts"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/ml/publications-alerts"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span>Alertas</span>
              </Link>
              <Link
                href="/ml/orders"
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/orders")
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
              </Link>
              <Link
                href="/ml/shipments"
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/shipments")
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
              </Link>
              <Link
                href="/ml/payments"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/payments")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <CreditCard className="h-4 w-4" />
                <span>Pagos</span>
              </Link>
              <Link
                href="/ml/accounts"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/accounts")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Cuentas</span>
              </Link>

              {/* ── Sincronización ── */}
              <div className="my-2 border-t border-sidebar-border" />
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Sincronización</p>
              <Link
                href="/ml/importer"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/importer")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Database className="h-4 w-4" />
                <span>Importación inicial</span>
              </Link>
              <Link
                href="/ml/import-pro"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/import-pro")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Import Pro</span>
              </Link>
              <Link
                href="/ml/sync"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/sync")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
                </svg>
                <span>Sincronización</span>
              </Link>

              {/* ── Catálogo ── */}
              <div className="my-2 border-t border-sidebar-border" />
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Catálogo</p>
              <Link
                href="/ml/catalog/eligibility"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/catalog/eligibility")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
                </svg>
                <span>Elegibilidad</span>
              </Link>
              <Link
                href="/ml/catalog/optin"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/catalog/optin")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14m-7-7h14"/>
                </svg>
                <span>Opt-in</span>
              </Link>
              <Link
                href="/ml/catalog/migration"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/catalog/migration")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14m-7-7 7 7-7 7"/>
                </svg>
                <span>Migración</span>
              </Link>

              {/* ── Inteligencia ── */}
              <div className="my-2 border-t border-sidebar-border" />
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Inteligencia</p>
              <Link
                href="/ml/priorities"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/priorities")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                <span>Prioridades de publicación</span>
              </Link>

              {/* ── Operativo ── */}
              <div className="my-2 border-t border-sidebar-border" />
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">Operativo</p>
              <Link
                href="/ml/matcher"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/matcher")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/>
                  <rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>
                </svg>
                <span>Vinculación</span>
              </Link>
              <Link
                href="/ml/products/build"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/products/build")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8m-4-4h8" />
                </svg>
                <span>Crear productos</span>
              </Link>
              <Link
                href="/ml/products/unmatched"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/ml/products/unmatched")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6m0-6 6 6"/>
                </svg>
                <span>Sin vincular</span>
              </Link>

            </div>
          )}
        </div>

        {/* Shopify */}
        <div className="mt-2">
          <button
            onClick={() => setShopifyExpanded(!shopifyExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              {/* Shopify bag icon */}
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <span className="font-medium">Shopify</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${shopifyExpanded ? "rotate-180" : ""}`} />
          </button>

          {shopifyExpanded && (
            <div className="ml-8 mt-1 flex flex-col gap-1">
              <Link
                href="/shopify/products"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/shopify/products")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Productos</span>
              </Link>
              <Link
                href="/shopify/orders"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/shopify/orders")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                <span>Ventas</span>
              </Link>
              <Link
                href="/shopify/sync"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/shopify/sync")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
                <span>Sincronización</span>
              </Link>
              <Link
                href="/shopify/config"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/shopify/config")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Exportar a Shopify</span>
              </Link>
              <Link
                href="/integrations/shopify-stores"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/integrations/shopify-stores")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Tiendas</span>
              </Link>
            </div>
          )}
        </div>

        {/* Base de Productos */}
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
              <Link
                href="/inventory"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/inventory")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Productos</span>
              </Link>
              <Link
                href="/inventory/stock"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/inventory/stock")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <span>Stock General</span>
              </Link>
              <Link
                href="/inventory/sources"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/inventory/sources")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Database className="h-4 w-4" />
                <span>Fuentes</span>
              </Link>
              <Link
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
              </Link>
              <Link
                href="/inventory/sources/batch-import"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/inventory/sources/batch-import")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherUpload className="h-4 w-4" />
                <span>Importación inicial</span>
              </Link>
              <Link
                href="/suppliers"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive("/suppliers")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Truck className="h-4 w-4" />
                <span>Proveedores</span>
              </Link>
              <Link
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
              </Link>
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
              <Link
                href="/integrations"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/integrations"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Configuración</span>
              </Link>
              <Link
                href="/integrations/ml-templates"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/integrations/ml-templates"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherFileText className="h-4 w-4" />
                <span>Plantillas y Precios</span>
              </Link>
              <Link
                href="/integrations/ml-publish"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/integrations/ml-publish"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherUpload className="h-4 w-4" />
                <span>Publicar en ML</span>
              </Link>
              <Link
                href="/settings/reports"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/settings/reports"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <FeatherFileText className="h-4 w-4" />
                <span>Reportes de Ventas</span>
              </Link>
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="mt-2">
          <button
            onClick={() => setPricingExpanded(!pricingExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/>
                <path d="M12 6v2m0 8v2"/>
              </svg>
              <span className="font-medium">Precios</span>
            </div>
            <svg className={`h-4 w-4 transition-transform ${pricingExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {pricingExpanded && (
            <div className="ml-8 mt-1 flex flex-col gap-1">
              <Link
                href="/pricing"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/pricing"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                <span>Resumen</span>
              </Link>
              <Link
                href="/pricing/lists"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/pricing/lists")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                  <rect x="9" y="3" width="6" height="4" rx="1"/>
                  <path d="M9 12h6m-6 4h4"/>
                </svg>
                <span>Listas</span>
              </Link>
              <Link
                href="/pricing/exchange-rates"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/pricing/exchange-rates")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3l4 4-4 4"/><path d="M16 21l-4-4 4-4"/>
                  <path d="M3 7h13M8 17h13"/>
                </svg>
                <span>Tipos de cambio</span>
              </Link>
              <Link
                href="/pricing/calculator"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/pricing/calculator")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="2" width="16" height="20" rx="2"/>
                  <path d="M8 6h8M8 10h8M8 14h4"/>
                </svg>
                <span>Calculadora</span>
              </Link>
              <Link
                href="/pricing/results"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/pricing/results")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <span>Resultados</span>
              </Link>
            </div>
          )}
        </div>

        {/* Radar Editorial */}
        <div className="mt-2">
          <button
            onClick={() => setRadarExpanded(!radarExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2"/>
                <path d="M12 2a10 10 0 0 1 0 20"/>
                <path d="M12 2a10 10 0 0 0 0 20"/>
                <path d="M2 12h2m16 0h2M12 2v2m0 16v2"/>
              </svg>
              <span className="font-medium">Radar Editorial</span>
            </div>
            <svg className={`h-4 w-4 transition-transform ${radarExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {radarExpanded && (
            <div className="ml-8 mt-1 flex flex-col gap-1">
              {[
                { href: "/radar",              label: "Dashboard",        icon: <><circle cx="12" cy="12" r="3"/><path d="M3 12h2m14 0h2M12 3v2m0 14v2"/></> },
                { href: "/radar/oportunidades", label: "Oportunidades",   icon: <><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></> },
                { href: "/radar/tendencias",    label: "Tendencias",      icon: <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></> },
                { href: "/radar/huecos",        label: "Huecos de mercado", icon: <><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></> },
                { href: "/radar/adaptaciones",          label: "Adaptaciones",          icon: <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></> },
                { href: "/radar/adaptaciones-tempranas", label: "Adaptaciones tempranas", icon: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></> },
                { href: "/radar/volver-a-pedir", label: "Volver a pedir",  icon: <><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></> },
                { href: "/radar/config",        label: "Configuración",   icon: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></> },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    pathname === item.href || (item.href !== "/radar" && pathname?.startsWith(item.href))
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon}
                  </svg>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Envíos */}
        <div className="mt-2">
          <button
            onClick={() => setEnviosExpanded(!enviosExpanded)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5" />
              <span className="font-medium">Envíos</span>
            </div>
            <svg className={`h-4 w-4 transition-transform ${enviosExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {enviosExpanded && (
            <div className="ml-8 mt-1 flex flex-col gap-1">
              <Link
                href="/envios"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === "/envios"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                <span>Panel</span>
              </Link>
              <Link
                href="/envios/transportistas"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/envios/transportistas")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Truck className="h-4 w-4" />
                <span>Transportistas</span>
              </Link>
            </div>
          )}
        </div>

        {/* Facturación */}
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
            <Link
              href="/billing/mercadolibre"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                pathname?.startsWith("/billing/mercadolibre")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
              </svg>
              <span>Ventas ML</span>
            </Link>
            <Link
              href="/billing/shopify"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                pathname?.startsWith("/billing/shopify")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              <span>Ventas Shopify</span>
            </Link>
          </div>
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
