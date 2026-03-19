"use client"

import Link from "next/link"
import { Package, ShoppingCart, TrendingUp, Database, Upload } from "lucide-react"

export function InventorySidebar() {
  return (
    <aside className="w-64 border-r border-border bg-sidebar">
      <nav className="flex flex-col gap-1 p-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Package className="h-5 w-5" />
          <span className="font-medium">Dashboard</span>
        </Link>
        <Link
          href="/products"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="font-medium">Productos</span>
        </Link>
        <Link
          href="/inventory"
          className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2 text-sidebar-accent-foreground transition-colors"
        >
          <Database className="h-5 w-5" />
          <span className="font-medium">Base de Productos</span>
        </Link>
        <Link
          href="/inventory/sources"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Upload className="h-5 w-5" />
          <span className="font-medium">Fuentes de Importaci&oacute;n</span>
        </Link>
        <Link
          href="/destinations"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <TrendingUp className="h-5 w-5" />
          <span className="font-medium">Destinos</span>
        </Link>
        <Link
          href="/integrations"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <TrendingUp className="h-5 w-5" />
          <span className="font-medium">Integraciones</span>
        </Link>
      </nav>
    </aside>
  )
}
