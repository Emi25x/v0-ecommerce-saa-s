export interface CompetitionBoost {
  type: string
  status: string // opportunity, active, not_available
  description?: string
}

export interface CompetitionWinner {
  seller_id: string
  nickname: string
  price: number
  advantages: string[]
}

export interface Product {
  id: string
  title: string
  price: string
  inventory: number
  status: string
  image?: string
  catalog_listing?: boolean
  listing_type_id?: string
  account_id?: string
  account_nickname?: string
  seller_sku?: string
  competition?: {
    status: string // winning, competing, losing, sharing_first_place, listed, penalized
    price_to_win: number | null
    visit_share: string
    winner_price?: number
    has_opportunities: boolean
    last_analyzed?: string
    boosts?: CompetitionBoost[]
    winner?: CompetitionWinner
  }
}

export interface PagingInfo {
  total: number
  limit: number
  offset: number
}

export interface Filters {
  status: string
  catalog_listing: string
  listing_type: string
  tags: string
  sub_status: string
  competition_status: string
}

export interface EditForm {
  price: string
  available_quantity: string
  title: string
}

export interface TrackingForm {
  enabled: boolean
  min_price: string
  max_price: string
  target_price: string
  strategy: string
}
