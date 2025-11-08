import { type NextRequest, NextResponse } from "next/server"
import { getMercadoLibreAuthUrl, generateCodeVerifier, generateCodeChallenge } from "@/lib/mercadolibre"

export async function GET(request: NextRequest) {
  try {
    const redirectUri = `${request.nextUrl.origin}/api/mercadolibre/callback`

    console.log("[v0] ML Auth - Starting authentication flow")
    console.log("[v0] ML Auth - Origin:", request.nextUrl.origin)
    console.log("[v0] ML Auth - Redirect URI:", redirectUri)
    console.log("[v0] ML Auth - CLIENT_ID configured:", !!process.env.MERCADOLIBRE_CLIENT_ID)
    console.log("[v0] ML Auth - CLIENT_SECRET configured:", !!process.env.MERCADOLIBRE_CLIENT_SECRET)

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    console.log("[v0] ML Auth - Code verifier generated")
    console.log("[v0] ML Auth - Code challenge generated")

    const authUrl = getMercadoLibreAuthUrl(redirectUri, codeChallenge)

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
