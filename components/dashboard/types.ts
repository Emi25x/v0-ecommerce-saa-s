export interface SystemStats {
  total_products: number
  with_stock: number
  without_ean: number
  pending_publish: number
}

export interface MlStats {
  total_published: number
  active: number
  paused: number
  sold: number
}

export interface Provider {
  name: string
  is_active: boolean
  last_run: string | null
  last_status: string | null
  products_count: number
  stock_total: number
}

export interface OpsStatus {
  providers: Provider[]
  system_stats: SystemStats
  ml_stats: MlStats
}

export interface ProcessRun {
  process_type: string
  process_name: string
  status: string
  started_at: string
  duration_ms: number | null
  rows_processed: number | null
  rows_updated: number | null
  rows_failed: number | null
  error_message: string | null
}
