import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateCodeVerifier, generateCodeChallenge, getMercadoLibreAuthUrl } from "@/lib/mercadolibre"

// Genera una URL OAuth de ML con PKCE guardado en BD (no en cookie)
// Así el link puede abrirse en cualquier browser/sesión sin depender de cookies
export async function POST(request: NextRequest) {
  try {
    const supabase   = await createClient()
    const origin      = request.nextUrl.origin
    const redirectUri = `${origin}/api/mercadolibre/callback`

    const codeVerifier  = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    // Guardar verifier en BD con TTL de 30 minutos
    const { data: token, error } = await supabase
      .from("ml_auth_tokens")
      .insert({ code_verifier: codeVerifier })
      .select("id")
      .single()

    if (error || !token) {
      return NextResponse.json({ error: "Error generando token" }, { status: 500 })
    }

    // El token_id va en el state para que el callback lo recupere de la BD
    const state   = encodeURIComponent(`token=${token.id}`)
    const authUrl = getMercadoLibreAuthUrl(redirectUri, codeChallenge, state)

    return NextResponse.json({ url: authUrl, token_id: token.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
