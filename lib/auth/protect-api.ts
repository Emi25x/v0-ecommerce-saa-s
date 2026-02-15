import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
