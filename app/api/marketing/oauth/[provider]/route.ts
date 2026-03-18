import { NextRequest, NextResponse } from "next/server"
import { buildGoogleOAuthUrl } from "@/domains/marketing/google"
import { buildMetaOAuthUrl } from "@/domains/marketing/meta"
import { buildTikTokOAuthUrl } from "@/domains/marketing/tiktok"
import { createAdminClient } from "@/lib/db/admin"
import { getAppOrigin } from "@/lib/env/config"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  const origin = getAppOrigin(request)
  const redirectUri = `${origin}/api/marketing/oauth/callback`

  // Load credentials from DB
  const supabase = createAdminClient()
  const { data: conn } = await supabase
    .from("marketing_connections")
    .select("credentials")
    .eq("platform", provider)
    .single()

  const credentials = conn?.credentials ?? {}

  let oauthUrl: string

  try {
    switch (provider) {
      case "google_ads":
      case "google_analytics":
      case "google_search_console":
      case "google_merchant":
        oauthUrl = buildGoogleOAuthUrl(credentials, provider, redirectUri)
        break
      case "meta_ads":
        oauthUrl = buildMetaOAuthUrl(credentials, redirectUri)
        break
      case "tiktok_ads":
        oauthUrl = buildTikTokOAuthUrl(credentials, redirectUri)
        break
      case "linkedin_ads": {
        const liParams = new URLSearchParams({
          response_type: "code",
          client_id: credentials.client_id ?? "",
          redirect_uri: redirectUri,
          scope: "r_ads,r_ads_reporting",
          state: "linkedin_ads",
        })
        oauthUrl = `https://www.linkedin.com/oauth/v2/authorization?${liParams}`
        break
      }
      case "pinterest_ads": {
        const piParams = new URLSearchParams({
          client_id: credentials.app_id ?? "",
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "ads:read,boards:read,pins:read",
          state: "pinterest_ads",
        })
        oauthUrl = `https://www.pinterest.com/oauth/?${piParams}`
        break
      }
      default:
        return NextResponse.json({ error: "Provider not supported" }, { status: 400 })
    }

    return NextResponse.redirect(oauthUrl)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
