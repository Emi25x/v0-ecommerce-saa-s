import { type NextRequest, NextResponse } from "next/server"
import { exchangeCodeForToken, getMercadoLibreUser, refreshTokenIfNeeded } from "@/lib/mercadolibre"
import { createClient } from "@/lib/supabase/server"
import { executeMlSync } from "@/lib/mercadolibre/sync-logic"

export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || origin

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
      return NextResponse.redirect(`${origin}/integrations?error=ml_error&message=${encodeURIComponent(error)}`)
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/integrations?error=no_code`)
    }

    // El state puede contener token=<uuid> (verifier en BD) o from=billing (origen)
    const stateRaw   = request.nextUrl.searchParams.get("state") || ""
    const stateParam = decodeURIComponent(stateRaw)
    const tokenMatch = stateParam.match(/token=([0-9a-f-]{36})/)
    const tokenId    = tokenMatch?.[1] || null

    let codeVerifier: string | undefined

    if (tokenId) {
      // Flujo "link copiable": recuperar verifier de la BD
      const supabaseForToken = await createClient()
      const { data: tokenRow } = await supabaseForToken
        .from("ml_auth_tokens")
        .select("code_verifier, used, expires_at")
        .eq("id", tokenId)
        .single()

      if (!tokenRow || tokenRow.used || new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.redirect(`${origin}/integrations?error=token_expired`)
    }

      // Marcar como usado (un solo uso)
      await supabaseForToken.from("ml_auth_tokens").update({ used: true }).eq("id", tokenId)
      codeVerifier = tokenRow.code_verifier
    } else {
      // Flujo normal: verifier en cookie
      codeVerifier = request.cookies.get("ml_code_verifier")?.value
    }

    if (!codeVerifier) {
      return NextResponse.redirect(`${origin}/integrations?error=no_verifier`)
    }

    const redirectUri = `${origin}/api/mercadolibre/callback`

    const tokens = await exchangeCodeForToken(code, redirectUri, codeVerifier)

    // Get user information
    const user = await getMercadoLibreUser(tokens.access_token)

    console.log("[v0] Mercado Libre connected:", user.nickname)
    console.log("[v0] Access token obtained")

    const supabase = await createClient()

    // Calculate token expiration (ML tokens expire in 6 hours)
    const tokenExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from("ml_accounts")
      .select("id")
      .eq("ml_user_id", user.id.toString())
      .single()

    // Obtener el user_id de Supabase para asociar la cuenta ML al usuario autenticado
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (existingAccount) {
      await supabase
        .from("ml_accounts")
        .update({
          access_token:     tokens.access_token,
          refresh_token:    tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          nickname:         user.nickname,
          user_id:          authUser?.id || null,
          updated_at:       new Date().toISOString(),
        })
        .eq("id", existingAccount.id)
    } else {
      await supabase.from("ml_accounts").insert({
        ml_user_id:       user.id.toString(),
        nickname:         user.nickname,
        access_token:     tokens.access_token,
        refresh_token:    tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
        user_id:          authUser?.id || null,
      })
    }

    // Disparar sincronización inicial en background (llamada directa, sin self-fetch)
    const account = existingAccount
      ? { ...existingAccount, access_token: tokens.access_token, refresh_token: tokens.refresh_token }
      : (await supabase.from("ml_accounts").select("id").eq("ml_user_id", user.id.toString()).single()).data

    if (account?.id) {
      executeMlSync(supabase, account.id, tokens.access_token, user.id.toString())
        .then(() => console.log("[v0] Sync inicial completada para:", user.nickname))
        .catch((err) => console.error("[v0] Error en sync inicial:", err))
    }

    // stateParam ya fue parseado arriba — determinar redirección de retorno
    const fromBilling = stateParam.includes("from=billing")
    const redirectTarget = fromBilling
      ? `${origin}/billing/mercadolibre?ml_connected=true`
      : `${origin}/integrations?ml_connected=true&ml_user=${encodeURIComponent(user.nickname)}`

    const response = NextResponse.redirect(redirectTarget)

    // Delete the code verifier
    response.cookies.delete("ml_code_verifier")

    response.cookies.set("ml_user_id", user.id.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return response
  } catch (error) {
    console.error("[v0] Mercado Libre callback error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.redirect(
      `${origin}/integrations?error=auth_failed&message=${encodeURIComponent(errorMessage)}`,
    )
  }
}
