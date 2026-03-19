import { updateSession } from "@/lib/db/proxy"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Authentication middleware.
 *
 * The `config.matcher` below excludes static assets (_next/static, _next/image, favicon, images).
 * This function only runs for app routes and API routes.
 *
 * ── Route Access Policy ─────────────────────────────────────────────────────
 *
 * | Category          | Prefix / Path                    | Auth Mechanism              |
 * |-------------------|----------------------------------|-----------------------------|
 * | Public pages      | /login, /auth/*                  | None (login flow)           |
 * | Cron jobs         | /api/cron/*                      | requireCron() — CRON_SECRET |
 * | Supplier imports  | /api/azeta/*, /api/arnoia/*      | requireCron() — CRON_SECRET |
 * | Inventory imports | /api/inventory/import/*           | requireCron() — CRON_SECRET |
 * | Inventory sources | /api/inventory/sources/*          | requireCron() — CRON_SECRET |
 * | ML webhooks       | /api/mercadolibre/webhooks/*      | Payload user_id validation  |
 * | Generic webhooks  | /api/webhooks/*                   | Per-handler validation      |
 * | Shopify OAuth     | /api/shopify/oauth/callback       | OAuth state param           |
 * | Auth callbacks    | /api/auth/*                       | OAuth flow                  |
 * | All other routes  | *                                | Supabase user session       |
 *
 * IMPORTANT: Middleware bypass does NOT mean "no auth". Each bypassed route
 * uses its own handler-level auth (requireCron, signature checks, etc).
 * Middleware bypass only skips Supabase session refresh for routes that
 * don't need or can't have a user session.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/error"] as const

const UNAUTHENTICATED_API_PREFIXES = [
  "/api/auth/",                       // OAuth callbacks
  "/api/cron/",                       // Cron jobs — secured by requireCron()
  "/api/azeta/",                      // Supplier imports — secured by requireCron()
  "/api/arnoia/",                     // Supplier imports — secured by requireCron()
  "/api/inventory/import/",           // Batch imports — secured by requireCron()
  "/api/inventory/sources/",          // Source config — secured by requireCron()
  "/api/webhooks/",                   // Generic webhooks — per-handler auth
  "/api/mercadolibre/webhooks/",      // ML webhooks — payload user_id validation
  "/api/shopify/oauth/callback",      // Shopify OAuth — state param validation
] as const

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public pages
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next()
  }

  // API routes that use service role internally — no user session needed
  if (UNAUTHENTICATED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // All other routes: validate Supabase session
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all routes except static assets:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - image files (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
