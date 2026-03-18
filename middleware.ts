import { updateSession } from '@/lib/db/proxy'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rutas públicas permitidas sin autenticación
  const publicRoutes = [
    '/login',
    '/auth/callback',
    '/auth/error',
  ]

  // Skip auth routes and static files
  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next()
  }

  // Permitir sin auth: API de importación y cron jobs
  // Estas rutas usan service role de Supabase internamente — no necesitan sesión de usuario
  if (
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/azeta/') ||
    pathname.startsWith('/api/arnoia/') ||
    pathname.startsWith('/api/inventory/import/') ||
    pathname.startsWith('/api/inventory/sources/') ||
    pathname.startsWith('/api/shopify/oauth/callback')
  ) {
    return NextResponse.next()
  }

  // Proteger TODAS las demás rutas (app y API)
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
