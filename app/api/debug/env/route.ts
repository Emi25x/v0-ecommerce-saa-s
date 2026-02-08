import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/debug/env
 * Endpoint de diagnóstico para verificar variables de entorno
 * SOLO PARA DEBUG - REMOVER EN PRODUCCIÓN
 */
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const vercelEnv = process.env.VERCEL_ENV || "development"
  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL
  
  // Extraer project ref del URL de Supabase
  let projectRef = "unknown"
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl)
      projectRef = url.hostname.split(".")[0]
    } catch (e) {
      projectRef = "invalid-url"
    }
  }

  return NextResponse.json({
    environment: vercelEnv,
    vercelUrl: vercelUrl || "not-set",
    supabase: {
      host: supabaseUrl ? new URL(supabaseUrl).hostname : "not-set",
      projectRef,
      urlConfigured: !!supabaseUrl
    },
    envVars: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasNextPublicSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnonKey: !!process.env.SUPABASE_ANON_KEY,
      hasSupabaseServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasCronSecret: !!process.env.CRON_SECRET
    }
  })
}
