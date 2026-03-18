// Configuración global de la aplicación

import type { NextRequest } from "next/server"

// Origin de la app para OAuth redirects y URLs externas.
// Prioriza NEXT_PUBLIC_APP_URL (dominio custom registrado en ML/Shopify/etc),
// luego VERCEL_URL, luego request.nextUrl.origin como último recurso (dev).
export function getAppOrigin(request?: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  }
  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`
  }
  if (request) {
    return request.nextUrl.origin
  }
  return "http://localhost:3000"
}

