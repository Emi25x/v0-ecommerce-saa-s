import { createClient } from "@supabase/supabase-js"

/**
 * Supabase Admin Client - Usa service_role key
 * 
 * SOLO para uso en server-side:
 * - API routes
 * - Server actions
 * - Cron jobs
 * 
 * NUNCA exponer al cliente
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
  }

  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Helper para validar cron secret en API routes
 */
export function validateCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  
  if (!cronSecret) {
    console.error("[CRON] CRON_SECRET not configured")
    return false
  }
  
  if (!authHeader) {
    console.error("[CRON] No authorization header")
    return false
  }
  
  const token = authHeader.replace("Bearer ", "")
  
  if (token !== cronSecret) {
    console.error("[CRON] Invalid cron secret")
    return false
  }
  
  return true
}
