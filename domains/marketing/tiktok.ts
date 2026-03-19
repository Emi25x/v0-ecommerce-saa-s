// TikTok Ads API client

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3"

export async function getTikTokCampaigns(
  credentials: Record<string, any>,
  options: {
    startDate: string
    endDate: string
  },
) {
  const res = await fetch(`${TIKTOK_API_BASE}/campaign/get/`, {
    method: "POST",
    headers: {
      "Access-Token": credentials.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      advertiser_id: credentials.advertiser_id,
      fields: ["campaign_id", "campaign_name", "status", "budget", "budget_mode", "objective_type"],
      page: 1,
      page_size: 50,
    }),
  })
  if (!res.ok) throw new Error(`TikTok campaigns error: ${await res.text()}`)
  const data = await res.json()
  return data.data?.list ?? []
}

export async function getTikTokReport(
  credentials: Record<string, any>,
  options: {
    startDate: string
    endDate: string
  },
) {
  const res = await fetch(`${TIKTOK_API_BASE}/report/integrated/get/`, {
    method: "POST",
    headers: {
      "Access-Token": credentials.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      advertiser_id: credentials.advertiser_id,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: [
        "spend",
        "impressions",
        "clicks",
        "ctr",
        "cpc",
        "reach",
        "conversion",
        "cost_per_conversion",
        "conversion_rate",
        "real_time_conversion",
        "real_time_cost_per_conversion",
      ],
      start_date: options.startDate,
      end_date: options.endDate,
      page: 1,
      page_size: 50,
    }),
  })
  if (!res.ok) throw new Error(`TikTok report error: ${await res.text()}`)
  const data = await res.json()
  return data.data?.list ?? []
}

export function buildTikTokOAuthUrl(credentials: Record<string, any>, redirectUri: string): string {
  const params = new URLSearchParams({
    app_id: credentials.app_id,
    redirect_uri: redirectUri,
    state: "tiktok_ads",
    scope: "campaign.read,report.read,account.read",
  })
  return `https://business-api.tiktok.com/portal/auth?${params}`
}

export async function exchangeTikTokCode(credentials: Record<string, any>, code: string, redirectUri: string) {
  const res = await fetch(`${TIKTOK_API_BASE}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: credentials.app_id,
      secret: credentials.app_secret,
      auth_code: code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`TikTok OAuth error: ${await res.text()}`)
  return res.json()
}
