/**
 * Domain types for ML Import Pro
 *
 * Pure data structures — no dependencies on infrastructure.
 */

// ── Import Status (state machine states) ────────────────────────────────────

export const IMPORT_STATUSES = [
  "idle",
  "running",
  "paused",
  "done",
  "failed",
  "scan_complete_pending_verification",
] as const

export type ImportStatus = (typeof IMPORT_STATUSES)[number]

// ── Import Progress (persisted state) ───────────────────────────────────────

export interface ImportProgress {
  account_id: string
  status: ImportStatus
  publications_offset: number
  publications_total: number | null
  publications_scope: "all" | "active_only"
  activity_since: string
  scroll_id: string | null
  paused_until: string | null
  last_error: string | null
  last_error_at: string | null
  last_run_at: string | null
  finished_at: string | null
  // Audit counters
  ml_items_seen_count: number
  db_rows_upserted_count: number
  upsert_errors_count: number
  // Metric counters
  discovered_count: number
  fetched_count: number
  upsert_new_count: number
  request_count: number
  last_sync_batch_at: string | null
}

// ── ML Account ──────────────────────────────────────────────────────────────

export interface MlAccount {
  id: string
  ml_user_id: string
  nickname: string
  access_token?: string
  refresh_token?: string
}

// ── Scan Page (result from ML search_type=scan) ─────────────────────────────

export interface ScanPage {
  item_ids: string[]
  scroll_id: string | null
  total: number
}

// ── ML Item (raw from multiget) ─────────────────────────────────────────────

export interface MlRawItem {
  code: number
  body: MlItemBody | null
}

export interface MlItemBody {
  id: string
  title: string
  price: number
  available_quantity: number
  sold_quantity: number
  status: string
  permalink: string
  listing_type_id: string | null
  thumbnail: string | null
  seller_custom_field: string | null
  attributes: MlAttribute[]
  variations: MlVariation[]
  shipping: MlShipping | null
  tags: string[]
  catalog_listing: boolean
  catalog_listing_eligible: boolean
}

export interface MlAttribute {
  id: string
  value_name: string | null
  value_struct?: { number?: number; unit?: string }
}

export interface MlVariation {
  seller_custom_field?: string | null
  attributes?: MlAttribute[]
}

export interface MlShipping {
  dimensions?: { weight?: number | string }
}

// ── Publication Row (DB shape) ──────────────────────────────────────────────

export interface PublicationRow {
  account_id: string
  ml_item_id: string
  title: string
  price: number
  current_stock: number
  sold_quantity: number
  status: string
  permalink: string
  listing_type_id: string | null
  thumbnail: string | null
  sku: string | null
  isbn: string | null
  gtin: string | null
  ean: string | null
  catalog_listing: boolean
  catalog_listing_eligible: boolean
  meli_weight_g?: number
  last_sync_at: string
  updated_at: string
}

// ── Run Input / Result ──────────────────────────────────────────────────────

export interface ImportRunInput {
  account_id: string
  max_seconds?: number
  detail_batch?: number
  concurrency?: number
}

export interface ImportRunResult {
  ok: boolean
  imported_count: number
  ml_items_seen_count: number
  db_rows_upserted: number
  total_seen: number
  total_upserted: number
  total_upsert_errors: number
  ml_total: number
  db_gap: number
  elapsed_ms: number
  has_more: boolean
  last_scroll_id: string | null
  errors_count: number
  rate_limited: boolean
}

// ── Status Response ─────────────────────────────────────────────────────────

export interface ImportStatusResponse {
  ok: boolean
  account: { id: string; nickname: string }
  progress: ImportProgress & {
    publications_progress: number
    publications_in_db: number
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

export const ML_SCAN_PAGE_SIZE = 50
export const ML_MULTIGET_MAX_IDS = 20
export const ML_ATTRIBUTES =
  "id,title,price,available_quantity,sold_quantity,status,permalink,thumbnail,listing_type_id,seller_custom_field,attributes,variations,shipping,tags,catalog_listing,catalog_listing_eligible"
export const CONCURRENCY_STALE_THRESHOLD_MS = 90_000
export const SCROLL_COVERAGE_THRESHOLD = 0.95
export const UPSERT_HEALTH_THRESHOLD = 0.9
export const MAX_CONSECUTIVE_EMPTY_SCANS = 3
