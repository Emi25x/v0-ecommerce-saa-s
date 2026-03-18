// ── Types ──────────────────────────────────────────────────────────────────

export interface Publication {
  id: string
  ml_item_id: string
  account_id: string
  title: string
  status: string
  price: number | null
  current_stock: number | null
  sku: string | null
  ean: string | null
  isbn: string | null
  gtin: string | null
  catalog_listing_eligible: boolean | null
  catalog_listing: boolean | null
  catalog_linked_item_id: string | null
  product_id: string | null
  permalink: string | null
  meli_weight_g: number | null
  last_sync_at: string | null
  updated_at: string
}

export interface Account {
  id: string
  nickname: string
}

export interface Counts {
  total:            number
  active:           number
  paused:           number
  closed:           number
  sin_producto:     number
  sin_stock:        number
  eligible_catalog: number
}

export interface DuplicateGroup {
  sku:          string
  traditional:  Publication[]
  catalog:      Publication[]
}

export interface ImportProgress {
  status: string
  publications_scope: string | null
  publications_offset: number
  publications_total: number | null
  discovered_count: number | null
  fetched_count: number | null
  upsert_new_count: number | null
  failed_count: number | null
  last_error: string | null
  last_error_at: string | null
  last_run_at: string | null
  last_sync_batch_at: string | null
  finished_at: string | null
  updated_at: string | null
  // audit columns
  ml_items_seen_count: number | null
  db_rows_upserted_count: number | null
  upsert_errors_count: number | null
}

export interface HistorialData {
  stock_history: {
    id: string
    old_quantity: number | null
    new_quantity: number
    changed_by_user_id: string | null
    source: string
    notes: string | null
    created_at: string
  }[]
  ml_snapshot: {
    available_quantity: number | null
    price: number | null
    status: string | null
  } | null
  sales: {
    order_id: number
    status: string
    date: string
    qty_sold: number
    unit_price: number
  }[]
}

// ── Constants ──────────────────────────────────────────────────────────────

export const PAGE_SIZE = 50

export const STATUS_LABEL: Record<string, string> = {
  active:       "Activa",
  paused:       "Pausada",
  closed:       "Cerrada",
  under_review: "Revision",
  inactive:     "Inactiva",
}

export const STATUS_COLOR: Record<string, string> = {
  active:       "bg-green-500/15 text-green-400 border-green-500/30",
  paused:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  closed:       "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  under_review: "bg-red-500/15 text-red-400 border-red-500/30",
  inactive:     "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
}

export const SOURCE_LABEL: Record<string, string> = {
  webhook_item_update: "Actualizacion ML",
  order_sold:          "Venta",
  cron_reprice:        "Repricing",
  import:              "Importacion",
  manual:              "Sync manual",
  bulk_update:         "Bulk update",
  sync_related:        "Sync relacionada",
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  paid:        "Pagado",
  confirmed:   "Confirmado",
  cancelled:   "Cancelado",
  invalid:     "Invalido",
}

export const COLOR_MAP: Record<string, string> = {
  green:   "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25",
  yellow:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25",
  zinc:    "bg-zinc-500/15 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/25",
  orange:  "bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25",
  red:     "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25",
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25",
  default: "bg-muted/40 text-muted-foreground border-border hover:bg-muted/60",
}

// ── Helpers ────────────────────────────────────────────────────────────────

export const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(n)
    : "\u2014"

export const relDate = (iso: string | null | undefined) => {
  if (!iso) return "\u2014"
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Hoy"
  if (days === 1) return "Ayer"
  if (days < 30) return `Hace ${days}d`
  return d.toLocaleDateString("es-AR")
}
