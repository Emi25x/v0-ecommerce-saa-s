"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"

/**
 * Wrapper que solo renderiza el sidebar en rutas protegidas
 * No muestra sidebar en rutas de autenticación (/login, /auth/*)
 */
export function ConditionalSidebar() {
  const pathname = usePathname()

  // Rutas donde NO debe mostrarse el sidebar
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth/')

  if (isAuthRoute) {
    return null
  }

  return <AppSidebar />
}
