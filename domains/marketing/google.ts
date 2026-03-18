// Google APIs client library
// Handles OAuth token refresh and API calls for all Google services

async function refreshGoogleToken(credentials: Record<string, any>): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

// ── Google Analytics 4 ────────────────────────────────────────────────────────

export async function getGA4Report(credentials: Record<string, any>, options: {
  startDate: string
  endDate: string
  propertyId?: string
}) {
  const token = await refreshGoogleToken(credentials)
  const propertyId = options.propertyId || credentials.property_id

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: options.startDate, endDate: options.endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
          { name: "conversions" },
          { name: "totalRevenue" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
    }
  )
  if (!res.ok) throw new Error(`GA4 API error: ${await res.text()}`)
  const data = await res.json()

  return (data.rows ?? []).map((row: any) => ({
    date: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value),
    users: parseInt(row.metricValues[1].value),
    new_users: parseInt(row.metricValues[2].value),
    pageviews: parseInt(row.metricValues[3].value),
    bounce_rate: parseFloat(row.metricValues[4].value),
    avg_session_duration: parseFloat(row.metricValues[5].value),
    conversions: parseFloat(row.metricValues[6].value),
    revenue: parseFloat(row.metricValues[7].value),
  }))
}

export async function getGA4Realtime(credentials: Record<string, any>) {
  const token = await refreshGoogleToken(credentials)
  const propertyId = credentials.property_id

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dimensions: [{ name: "country" }, { name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
      }),
    }
  )
  if (!res.ok) throw new Error(`GA4 Realtime error: ${await res.text()}`)
  return res.json()
}

// ── Google Ads ────────────────────────────────────────────────────────────────

export async function getGoogleAdsCampaigns(credentials: Record<string, any>, options: {
  startDate: string
  endDate: string
}) {
  const token = await refreshGoogleToken(credentials)
  const customerId = (credentials.customer_id || "").replace(/-/g, "")

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.average_cpc,
      metrics.ctr,
      metrics.average_cpm
    FROM campaign
    WHERE segments.date BETWEEN '${options.startDate}' AND '${options.endDate}'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `

  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": credentials.developer_token,
        "Content-Type": "application/json",
        ...(credentials.login_customer_id ? { "login-customer-id": credentials.login_customer_id.replace(/-/g, "") } : {}),
      },
      body: JSON.stringify({ query }),
    }
  )
  if (!res.ok) throw new Error(`Google Ads API error: ${await res.text()}`)
  const data = await res.json()

  return (data.results ?? []).map((r: any) => ({
    campaign_id: r.campaign.id,
    campaign_name: r.campaign.name,
    status: r.campaign.status,
    channel_type: r.campaign.advertisingChannelType,
    impressions: parseInt(r.metrics.impressions ?? 0),
    clicks: parseInt(r.metrics.clicks ?? 0),
    spend: (parseInt(r.metrics.costMicros ?? 0) / 1_000_000),
    conversions: parseFloat(r.metrics.conversions ?? 0),
    conversion_value: parseFloat(r.metrics.conversionsValue ?? 0),
    roas: r.metrics.costMicros > 0 ? (parseFloat(r.metrics.conversionsValue ?? 0) / (parseInt(r.metrics.costMicros ?? 0) / 1_000_000)) : 0,
    ctr: parseFloat(r.metrics.ctr ?? 0),
    cpc: (parseInt(r.metrics.averageCpc ?? 0) / 1_000_000),
    cpm: (parseInt(r.metrics.averageCpm ?? 0) / 1_000_000),
  }))
}

// ── Google Search Console ─────────────────────────────────────────────────────

export async function getSearchConsoleData(credentials: Record<string, any>, options: {
  startDate: string
  endDate: string
  dimensions?: string[]
}) {
  const token = await refreshGoogleToken(credentials)
  const siteUrl = credentials.site_url

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: options.startDate,
        endDate: options.endDate,
        dimensions: options.dimensions ?? ["query"],
        rowLimit: 100,
        searchType: "web",
      }),
    }
  )
  if (!res.ok) throw new Error(`Search Console API error: ${await res.text()}`)
  const data = await res.json()

  return (data.rows ?? []).map((row: any) => ({
    keys: row.keys,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }))
}

// ── Google Merchant Center ────────────────────────────────────────────────────

export async function getMerchantProducts(credentials: Record<string, any>) {
  const token = await refreshGoogleToken(credentials)
  const merchantId = credentials.merchant_id

  const res = await fetch(
    `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products?maxResults=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )
  if (!res.ok) throw new Error(`Merchant Center API error: ${await res.text()}`)
  const data = await res.json()

  return {
    total: data.totalMatchingProducts ?? 0,
    products: (data.resources ?? []).slice(0, 20).map((p: any) => ({
      id: p.id,
      title: p.title,
      price: p.price?.value,
      currency: p.price?.currency,
      availability: p.availability,
      condition: p.condition,
      brand: p.brand,
      image_link: p.imageLink,
    })),
  }
}

// ── OAuth URL builders ────────────────────────────────────────────────────────

export function buildGoogleOAuthUrl(credentials: Record<string, any>, service: string, redirectUri: string): string {
  const scopes: Record<string, string[]> = {
    google_ads: [
      "https://www.googleapis.com/auth/adwords",
    ],
    google_analytics: [
      "https://www.googleapis.com/auth/analytics.readonly",
    ],
    google_search_console: [
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
    google_merchant: [
      "https://www.googleapis.com/auth/content",
    ],
  }

  const scope = (scopes[service] ?? []).join(" ")
  const params = new URLSearchParams({
    client_id: credentials.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state: service,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeGoogleCode(credentials: Record<string, any>, code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`OAuth code exchange failed: ${await res.text()}`)
  return res.json()
}
