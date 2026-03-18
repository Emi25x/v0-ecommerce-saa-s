import { createClient } from '@/lib/db/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Helper para proteger endpoints API críticos.
 * Verifica que haya una sesión activa y devuelve 401 si no hay usuario autenticado.
 * 
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const authCheck = await protectAPI()
 *   if (authCheck.error) return authCheck.response
 *   
 *   const { user } = authCheck
 *   // Continuar con lógica del endpoint usando user.id
 * }
 * ```
 */
/**
 * Protege endpoints invocados por cron jobs o servicios internos.
 * Acepta peticiones que incluyan el header X-CRON-SECRET correcto,
 * o que tengan una sesión de usuario activa (para uso desde la UI).
 *
 * @example
 * ```ts
 * export async function POST(request: NextRequest) {
 *   const authCheck = await protectCron(request)
 *   if (authCheck.error) return authCheck.response
 * }
 * ```
 */
export async function protectCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')

  // 1. Allow cron / service-to-service calls via shared secret
  if (cronSecret && headerSecret && headerSecret === cronSecret) {
    return { error: false, response: null, user: null, via: 'cron' as const }
  }

  // 2. Fall back to session check (allows triggering from the UI)
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (!error && user) {
      return { error: false, response: null, user, via: 'session' as const }
    }
  } catch { /* ignore */ }

  return {
    error: true,
    response: NextResponse.json(
      { error: 'unauthorized', message: 'X-CRON-SECRET inválido o sesión requerida' },
      { status: 401 }
    ),
    user: null,
    via: null,
  }
}

export async function protectAPI() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return {
        error: true,
        response: NextResponse.json(
          { error: 'unauthorized', message: 'Autenticación requerida' },
          { status: 401 }
        ),
        user: null
      }
    }

    return {
      error: false,
      response: null,
      user
    }
  } catch (err) {
    console.error('[protectAPI] Error checking auth:', err)
    return {
      error: true,
      response: NextResponse.json(
        { error: 'auth_error', message: 'Error verificando autenticación' },
        { status: 500 }
      ),
      user: null
    }
  }
}
