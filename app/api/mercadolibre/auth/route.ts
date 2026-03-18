import { type NextRequest, NextResponse } from "next/server"
import { getMercadoLibreAuthUrl, generateCodeVerifier, generateCodeChallenge } from "@/lib/mercadolibre"
import { getAppOrigin } from "@/lib/env/config"

export async function GET(request: NextRequest) {
  try {
    const origin      = getAppOrigin(request)
    const from        = request.nextUrl.searchParams.get("from") || ""
    const redirectUri = `${origin}/api/mercadolibre/callback`

    const codeVerifier  = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    // Construir authUrl con state para saber el origen del flujo
    const state   = from ? encodeURIComponent(`from=${from}`) : ""
    const authUrl = getMercadoLibreAuthUrl(redirectUri, codeChallenge, state)

    const response = NextResponse.redirect(authUrl)
    response.cookies.set("ml_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    })

    return response
  } catch (error) {
    console.error("[v0] Mercado Libre auth error:", error)
    return NextResponse.json({ error: "Failed to initiate authentication" }, { status: 500 })
  }
}
