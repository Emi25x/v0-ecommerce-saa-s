import { NextRequest, NextResponse } from "next/server"
import { exchangeGoogleCode } from "@/lib/marketing/google"
import { exchangeMetaCode } from "@/lib/marketing/meta"
import { exchangeTikTokCode } from "@/lib/marketing/tiktok"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") // platform identifier
  const error = searchParams.get("error")
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const redirectUri = `${origin}/api/marketing/oauth/callback`

  if (error) {
    return NextResponse.redirect(`${origin}/marketing/config?error=${encodeURIComponent(error)}&platform=${state}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/marketing/config?error=missing_code`)
  }

  const supabase = createAdminClient()

  try {
    // Get existing credentials
    const { data: conn } = await supabase
      .from("marketing_connections")
      .select("credentials")
      .eq("platform", state)
      .single()

    const credentials = conn?.credentials ?? {}
    let tokens: any = {}

    switch (state) {
      case "google_ads":
      case "google_analytics":
      case "google_search_console":
      case "google_merchant":
        tokens = await exchangeGoogleCode(credentials, code, redirectUri)
        break
      case "meta_ads":
        tokens = await exchangeMetaCode(credentials, code, redirectUri)
        break
      case "tiktok_ads":
        tokens = await exchangeTikTokCode(credentials, code, redirectUri)
        break
      default:
        // Generic code exchange
        tokens = { access_token: code, state }
    }

    // Store tokens in credentials
    await supabase
      .from("marketing_connections")
      .upsert({
        platform: state,
        credentials: { ...credentials, ...tokens },
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "platform" })

    return NextResponse.redirect(`${origin}/marketing/config?connected=${state}`)
  } catch (err: any) {
    console.error("[MARKETING-OAUTH] Callback error:", err)
    return NextResponse.redirect(`${origin}/marketing/config?error=${encodeURIComponent(err.message)}&platform=${state}`)
  }
}
