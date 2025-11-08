export interface Product {
  id: string
  sku: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface MLAccount {
  id: string
  user_id: string
  nickname: string
  access_token: string
  refresh_token: string
  expires_at: string
  created_at: string
  updated_at: string
}

export interface MLListing {
  id: string
  ml_id: string
  product_id: string | null
  account_id: string
  title: string
  price: number
  currency_id: string
  available_quantity: number
  status: string
  catalog_listing: boolean
  catalog_product_id: string | null
  permalink: string | null
  created_at: string
  updated_at: string
}

export interface ListingRelationship {
  id: string
  original_listing_id: string
  catalog_listing_id: string
  created_at: string
}

export interface StockSource {
  id: string
  name: string
  type: string
  config: Record<string, any> | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface StockSyncLog {
  id: string
  listing_id: string
  old_quantity: number | null
  new_quantity: number
  source: string
  created_at: string
}
