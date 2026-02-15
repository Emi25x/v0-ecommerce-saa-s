import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""

  // Logging temporal para debug
  console.log("[v0] Supabase Client Config:", {
    url: supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlIncludesRest: supabaseUrl.includes('/rest/v1'),
    urlIncludesAuth: supabaseUrl.includes('/auth/v1')
  })

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[v0] Missing Supabase environment variables")
    // Return a dummy client to prevent crashes
    return createBrowserClient("https://placeholder.supabase.co", "placeholder-key")
  }

  // Limpiar URL si incluye rutas REST o Auth (debe ser base URL)
  let cleanUrl = supabaseUrl.trim()
  if (cleanUrl.includes('/rest/v1')) {
    console.warn("[v0] WARNING: NEXT_PUBLIC_SUPABASE_URL contiene /rest/v1 - limpiando...")
    cleanUrl = cleanUrl.split('/rest/v1')[0]
  }
  if (cleanUrl.includes('/auth/v1')) {
    console.warn("[v0] WARNING: NEXT_PUBLIC_SUPABASE_URL contiene /auth/v1 - limpiando...")
    cleanUrl = cleanUrl.split('/auth/v1')[0]
  }

  console.log("[v0] Using cleaned URL:", cleanUrl)

  return createBrowserClient(cleanUrl, supabaseAnonKey)
}
