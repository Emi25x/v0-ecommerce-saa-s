export interface Product {
  id: string
  sku?: string
  ean?: string
  isbn?: string
  title: string
  description?: string | null
  price?: number | null
  cost_price?: number | null
  stock?: number | null
  brand?: string | null
  category?: string | null
  image_url?: string | null
  condition?: string | null
  status?: string
  author?: string | null
  language?: string | null
  custom_fields?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}
