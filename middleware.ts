import { updateSession } from '@/lib/supabase/proxy'
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

  // Permitir cron jobs con CRON_SECRET
  if (pathname.startsWith('/api/cron/') || pathname.startsWith('/api/azeta/') || pathname.startsWith('/api/arnoia/')) {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (authHeader && cronSecret) {
      const token = authHeader.replace('Bearer ', '')
      if (token === cronSecret) {
        // Cron job autenticado correctamente
        return NextResponse.next()
      }
    }
    // Si no tiene CRON_SECRET válido, continuar con auth normal
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
