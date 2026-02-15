import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Creates a Supabase client for server-side operations.
 * Always create a new client within each function when using it.
 */
export async function createClient() {
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Missing Supabase environment variables. Please check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.`,
    )
  }

  // Limpiar URL si incluye rutas REST o Auth
  if (supabaseUrl.includes('/rest/v1')) {
    supabaseUrl = supabaseUrl.split('/rest/v1')[0]
  }
  if (supabaseUrl.includes('/auth/v1')) {
    supabaseUrl = supabaseUrl.split('/auth/v1')[0]
  }

  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}

export { createServerClient } from "@supabase/ssr"
