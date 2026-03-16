export type MarketingPlatform =
  | "google_ads" | "google_analytics" | "google_search_console" | "google_merchant"
  | "meta_ads" | "tiktok_ads" | "linkedin_ads" | "pinterest_ads"
  | "klaviyo" | "mailchimp" | "brevo" | "hubspot" | "activecampaign"
  | "whatsapp"

export interface MarketingConnection {
  id: string
  platform: MarketingPlatform
  account_id: string | null
  account_name: string | null
  credentials: Record<string, any>
  is_active: boolean
  last_synced_at: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CampaignMetrics {
  platform: MarketingPlatform
  campaign_id: string
  campaign_name: string
  status: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  roas: number
  ctr: number
  cpc: number
  cpm: number
  date_start: string
  date_end: string
}

export interface PlatformSummary {
  platform: MarketingPlatform
  connected: boolean
  account_name: string | null
  total_spend: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  roas: number
  last_synced: string | null
}

export interface PlatformDefinition {
  id: MarketingPlatform
  name: string
  description: string
  category: "search" | "social" | "email" | "crm" | "ecommerce"
  auth_type: "oauth" | "api_key" | "api_key_secret"
  color: string
  fields: CredentialField[]
  capabilities: string[]
  oauth_url?: string
}

export interface CredentialField {
  key: string
  label: string
  type: "text" | "password" | "url"
  placeholder?: string
  required: boolean
  help?: string
}

export interface GoogleAnalyticsReport {
  date: string
  sessions: number
  users: number
  new_users: number
  pageviews: number
  bounce_rate: number
  avg_session_duration: number
  conversions: number
  revenue: number
}

export interface EmailCampaign {
  id: string
  name: string
  subject: string
  status: string
  send_time: string | null
  recipients: number
  opens: number
  clicks: number
  open_rate: number
  click_rate: number
  unsubscribes: number
  revenue: number
}
