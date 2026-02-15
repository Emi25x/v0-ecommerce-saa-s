"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"

/**
 * Wrapper que solo renderiza el sidebar en rutas protegidas
 * No muestra sidebar en rutas de autenticación (/login, /auth/*)
 */
export function ConditionalSidebar() {
  const pathname = usePathname()

  // Rutas donde NO debe mostrarse el sidebar
  const publicRoutes = [
    '/login',
    '/auth/callback',
    '/auth/error',
  ]

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  if (isPublicRoute) {
    return null
  }

  return <AppSidebar />
}
