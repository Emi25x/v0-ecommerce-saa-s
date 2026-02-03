import { type NextRequest, NextResponse } from "next/server"
import { exchangeCodeForToken, getMercadoLibreUser } from "@/lib/mercadolibre"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
      console.error("[v0] ML Callback - Error from ML:", error)
      const errorDescription = searchParams.get("error_description")
      console.error("[v0] ML Callback - Error description:", errorDescription)
      return NextResponse.redirect(`${request.nextUrl.origin}/integrations?error=ml_error&message=${error}`)
    }

    if (!code) {
      console.error("[v0] ML Callback - No code received")
      return NextResponse.redirect(`${request.nextUrl.origin}/integrations?error=no_code`)
    }

    console.log("[v0] ML Callback - Code received:", code.substring(0, 10) + "...")

    const codeVerifier = request.cookies.get("ml_code_verifier")?.value

    if (!codeVerifier) {
      console.error("[v0] ML Callback - No code verifier found in cookies")
      return NextResponse.redirect(`${request.nextUrl.origin}/integrations?error=no_verifier`)
    }

    console.log("[v0] ML Callback - Code verifier retrieved from cookie")

    const redirectUri = `${request.nextUrl.origin}/api/mercadolibre/callback`
    console.log("[v0] ML Callback - Using redirect URI:", redirectUri)

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

    if (existingAccount) {
      // Update existing account
      await supabase
        .from("ml_accounts")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          nickname: user.nickname,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAccount.id)

      console.log("[v0] ML Account updated in database:", user.nickname)
    } else {
      // Insert new account
      await supabase.from("ml_accounts").insert({
        ml_user_id: user.id.toString(),
        nickname: user.nickname,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
      })

      console.log("[v0] ML Account created in database:", user.nickname)
    }

    // Disparar sincronización inicial en background
    try {
      const syncUrl = `${request.nextUrl.origin}/api/mercadolibre/sync`
      fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ml_user_id: user.id.toString() }),
      }).then(() => {
        console.log("[v0] Sync inicial disparada para:", user.nickname)
      }).catch((err) => {
        console.error("[v0] Error disparando sync inicial:", err)
      })
    } catch (syncError) {
      console.error("[v0] Error en sync inicial:", syncError)
      // No bloqueamos el redirect si falla el sync
    }

    const response = NextResponse.redirect(
      `${request.nextUrl.origin}/integrations?ml_connected=true&ml_user=${user.nickname}`,
    )

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
      `${request.nextUrl.origin}/integrations?error=auth_failed&message=${encodeURIComponent(errorMessage)}`,
    )
  }
}
