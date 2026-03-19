import { updateSession } from "@/lib/db/proxy"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Authentication middleware.
 *
 * The `config.matcher` below excludes static assets (_next/static, _next/image, favicon, images).
 * This function only runs for app routes and API routes.
 *
 * Policy:
 *  - Public routes:       login, auth callbacks
 *  - Unauthenticated API: cron jobs (secured by Vercel infra), supplier imports,
 *                         OAuth callbacks, external webhooks
 *  - Everything else:     requires valid Supabase session
 */

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/error"] as const

const UNAUTHENTICATED_API_PREFIXES = [
  "/api/auth/",
  "/api/cron/",
  "/api/azeta/",
  "/api/arnoia/",
  "/api/inventory/import/",
  "/api/inventory/sources/",
  "/api/webhooks/",
  "/api/shopify/oauth/callback",
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
