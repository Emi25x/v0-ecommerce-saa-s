// Meta (Facebook/Instagram) Ads API client

const GRAPH_API_BASE = "https://graph.facebook.com/v20.0"

async function getMetaToken(credentials: Record<string, any>): Promise<string> {
  // Long-lived user token stored in credentials
  return credentials.access_token
}

export async function getMetaAdsCampaigns(credentials: Record<string, any>, options: {
  startDate: string
  endDate: string
}) {
  const token = await getMetaToken(credentials)
  const adAccountId = credentials.ad_account_id.startsWith("act_")
    ? credentials.ad_account_id
    : `act_${credentials.ad_account_id}`

  const fields = [
    "campaign_id", "campaign_name", "status",
    "impressions", "clicks", "spend",
    "actions", "action_values", "ctr", "cpc", "cpm",
    "reach", "frequency",
  ].join(",")

  const timeRange = JSON.stringify({ since: options.startDate, until: options.endDate })

  const res = await fetch(
    `${GRAPH_API_BASE}/${adAccountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&limit=50&access_token=${token}`
  )
  if (!res.ok) throw new Error(`Meta Ads API error: ${await res.text()}`)
  const data = await res.json()

  return (data.data ?? []).map((row: any) => {
    const purchaseAction = (row.actions ?? []).find((a: any) => a.action_type === "purchase")
    const purchaseValue = (row.action_values ?? []).find((a: any) => a.action_type === "purchase")
    const spend = parseFloat(row.spend ?? 0)
    const convValue = parseFloat(purchaseValue?.value ?? 0)

    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      status: row.status ?? "ACTIVE",
      impressions: parseInt(row.impressions ?? 0),
      clicks: parseInt(row.clicks ?? 0),
      spend,
      reach: parseInt(row.reach ?? 0),
      frequency: parseFloat(row.frequency ?? 0),
      conversions: parseFloat(purchaseAction?.value ?? 0),
      conversion_value: convValue,
      roas: spend > 0 ? convValue / spend : 0,
      ctr: parseFloat(row.ctr ?? 0),
      cpc: parseFloat(row.cpc ?? 0),
      cpm: parseFloat(row.cpm ?? 0),
    }
  })
}

export async function getMetaAccountInfo(credentials: Record<string, any>) {
  const token = credentials.access_token
  const adAccountId = credentials.ad_account_id.startsWith("act_")
    ? credentials.ad_account_id
    : `act_${credentials.ad_account_id}`

  const res = await fetch(
    `${GRAPH_API_BASE}/${adAccountId}?fields=name,account_status,currency,spend_cap,amount_spent&access_token=${token}`
  )
  if (!res.ok) throw new Error(`Meta account info error: ${await res.text()}`)
  return res.json()
}

export async function getMetaCatalogProducts(credentials: Record<string, any>) {
  const token = credentials.access_token
  const adAccountId = credentials.ad_account_id.startsWith("act_")
    ? credentials.ad_account_id
    : `act_${credentials.ad_account_id}`

  // Get product catalogs associated with ad account
  const res = await fetch(
    `${GRAPH_API_BASE}/${adAccountId}/product_catalogs?fields=id,name,product_count&access_token=${token}`
  )
  if (!res.ok) return { data: [] }
  return res.json()
}

export function buildMetaOAuthUrl(credentials: Record<string, any>, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: credentials.app_id,
    redirect_uri: redirectUri,
    scope: "ads_read,ads_management,business_management,catalog_management",
    response_type: "code",
    state: "meta_ads",
  })
  return `https://www.facebook.com/v20.0/dialog/oauth?${params}`
}

export async function exchangeMetaCode(credentials: Record<string, any>, code: string, redirectUri: string) {
  const res = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?client_id=${credentials.app_id}&client_secret=${credentials.app_secret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`
  )
  if (!res.ok) throw new Error(`Meta OAuth exchange failed: ${await res.text()}`)
  const data = await res.json()

  // Exchange for long-lived token
  const llRes = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${credentials.app_id}&client_secret=${credentials.app_secret}&fb_exchange_token=${data.access_token}`
  )
  if (!llRes.ok) return data
  return llRes.json()
}
