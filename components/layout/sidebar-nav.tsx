"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Home,
  Package,
  ShoppingBag,
  Truck,
  Settings,
  BarChart3,
  CreditCard,
  Receipt,
  Target,
} from "lucide-react"

const navItems = [
  {
    title: "Dashboard",
    href: "/",
    icon: Home,
  },
  {
    title: "Productos",
    href: "/products",
    icon: Package,
  },
  {
    title: "Órdenes",
    href: "/orders",
    icon: ShoppingBag,
  },
  {
    title: "Envíos",
    href: "/shipments",
    icon: Truck,
  },
  {
    title: "Pagos",
    href: "/pagos",
    icon: CreditCard,
  },
  {
    title: "Facturación",
    href: "/billing",
    icon: Receipt,
  },
  {
    title: "Reportes",
    href: "/reports",
    icon: BarChart3,
  },
  {
    title: "Integraciones",
    href: "/integrations",
    icon: Settings,
  },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-2 p-4">
      {navItems.map((item) => {
        const Icon = item.icon as React.ComponentType<{ className?: string }>
        const isActive = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.title}
          </Link>
        )
      })}
    </nav>
  )
}

export default SidebarNav
