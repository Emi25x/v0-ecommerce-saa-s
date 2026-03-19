/**
 * Unified auth guards for route handlers.
 *
 * Every route handler should use one of these — never rely solely on middleware.
 *
 * Usage:
 *   const auth = await requireUser()
 *   if (auth.error) return auth.response
 *   // auth.user is guaranteed non-null here
 *
 *   const cron = await requireCron(request)
 *   if (cron.error) return cron.response
 */
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import type { User } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserSuccess = {
  error: false
  response: null
  user: User
  supabase: SupabaseClient
}
type UserFailure = { error: true; response: NextResponse; user: null; supabase: null }
export type UserResult = UserSuccess | UserFailure

type CronSuccess = {
  error: false
  response: null
  via: "cron" | "session"
  user: User | null
}
type CronFailure = { error: true; response: NextResponse; via: null; user: null }
export type CronResult = CronSuccess | CronFailure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status })
}

/**
 * Timing-safe string comparison to prevent timing attacks on secret values.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  // crypto.subtle.timingSafeEqual is not available in all runtimes,
  // fallback to constant-time comparison
  let result = 0
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i]
  }
  return result === 0
}

// ---------------------------------------------------------------------------
// requireUser — for authenticated user routes
// ---------------------------------------------------------------------------

/**
 * Verifies an active Supabase user session.
 * Returns the user and a session-scoped Supabase client (respects RLS).
 */
export async function requireUser(): Promise<UserResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return {
        error: true,
        response: json({ ok: false, error: { code: "unauthorized", detail: "Autenticación requerida" } }, 401),
        user: null,
        supabase: null,
      }
    }

    return { error: false, response: null, user, supabase }
  } catch (err) {
    console.error("[requireUser] Error checking auth:", err)
    return {
      error: true,
      response: json({ ok: false, error: { code: "auth_error", detail: "Error verificando autenticación" } }, 500),
      user: null,
      supabase: null,
    }
  }
}

// ---------------------------------------------------------------------------
// requireCron — for cron jobs and internal service routes
// ---------------------------------------------------------------------------

/**
 * Validates cron/service requests.
 *
 * Accepts either:
 * 1. Header `x-cron-secret` matching CRON_SECRET
 * 2. Header `Authorization: Bearer <CRON_SECRET>`
 * 3. Active user session (for triggering from UI)
 *
 * CRON_SECRET **must** be configured — if missing, the route returns 500.
 */
export async function requireCron(request: NextRequest): Promise<CronResult> {
  const cronSecret = process.env.CRON_SECRET

  // Fail closed: if CRON_SECRET is not configured, reject
  if (!cronSecret) {
    console.error("[requireCron] CRON_SECRET not configured — rejecting request")
    return {
      error: true,
      response: json({ ok: false, error: { code: "config_error", detail: "Server misconfigured" } }, 500),
      via: null,
      user: null,
    }
  }

  // Check x-cron-secret header
  const headerSecret = request.headers.get("x-cron-secret")
  if (headerSecret && timingSafeEqual(headerSecret, cronSecret)) {
    return { error: false, response: null, via: "cron", user: null }
  }

  // Check Authorization: Bearer <secret>
  const authHeader = request.headers.get("authorization") || ""
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    if (timingSafeEqual(token, cronSecret)) {
      return { error: false, response: null, via: "cron", user: null }
    }
  }

  // Fallback to user session (allows triggering from UI)
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (!error && user) {
      return { error: false, response: null, via: "session", user }
    }
  } catch {
    /* session check failed — fall through to rejection */
  }

  return {
    error: true,
    response: json(
      { ok: false, error: { code: "unauthorized", detail: "CRON_SECRET inválido o sesión requerida" } },
      401,
    ),
    via: null,
    user: null,
  }
}
