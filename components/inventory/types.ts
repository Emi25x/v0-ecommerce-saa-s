export interface Product {
  id: string
  sku: string
  ean?: string
  title: string
  description?: string
  price?: number
  cost_price?: number
  stock?: number
  stock_by_source?: Record<string, number>
  condition?: string
  brand?: string
  category?: string
  source?: string[]
  internal_code?: string
  url_template?: string
  image_url?: string
  created_at?: string
  updated_at?: string
  custom_fields?: Record<string, unknown>
}

export interface ImportSource {
  id: string
  name: string
  url_template?: string
  source_key?: string
  credentials?: Record<string, unknown>
}

export interface ImportProgress {
  stage: string
  message: string
  show: boolean
}

export interface ImportSummaryData {
  imported?: number
  updated?: number
  skipped?: number
  failed?: number
  total?: number
  errors?: string[]
  sampleSkus?: Array<{
    sku: string
    title?: string
    status: string
  }>
}

export interface ValidationResults {
  errors?: string[]
  warnings?: string[]
}

export interface DiagnosticsData {
  totalProducts?: number
  productsBySource?: Array<{ source: string; count: number }>
  schedules?: any[]
  history?: any[]
  recentProducts?: any[]
}

export interface VerificationResult {
  found: boolean
  message: string
  totalProductsInDB?: number
  exactMatch?: Product
  similarMatches?: Product[]
}

export type SortOrder = "asc" | "desc"

export interface TimezoneOption {
  country: string
  timezone: string
}

export const TIMEZONES: TimezoneOption[] = [
  { country: "Argentina", timezone: "America/Argentina/Buenos_Aires" },
  { country: "Chile", timezone: "America/Santiago" },
  { country: "Colombia", timezone: "America/Bogota" },
  { country: "Espa\u00f1a", timezone: "Europe/Madrid" },
  { country: "Estados Unidos (Centro)", timezone: "America/Chicago" },
  { country: "Estados Unidos (Este)", timezone: "America/New_York" },
  { country: "Estados Unidos (Monta\u00f1a)", timezone: "America/Denver" },
  { country: "Estados Unidos (Pac\u00edfico)", timezone: "America/Los_Angeles" },
  { country: "M\u00e9xico (Centro)", timezone: "America/Mexico_City" },
  { country: "M\u00e9xico (Noroeste)", timezone: "America/Tijuana" },
  { country: "M\u00e9xico (Sureste)", timezone: "America/Cancun" },
  { country: "Venezuela", timezone: "America/Caracas" },
]

export const PRODUCTS_PER_PAGE = 100
