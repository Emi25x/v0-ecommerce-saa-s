import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

const PAGE_SIZE = 50

/**
 * GET /api/sales
 *
 * Unified sales listing with filters for the /sales dashboard.
 * Query params:
 *  - page (default 1)
 *  - filter: all | pending_export | exported | failed | missing_ean | cancelled | not_sent
 *  - platform_code: C1, C2, SP1, etc.
 *  - platform: mercadolibre, shopify
 *  - search: text search on customer_name, platform_order_id, libral_reference
 *  - from / to: date range (ISO)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const filter = searchParams.get("filter") ?? "all"
  const platformCode = searchParams.get("platform_code")
  const platform = searchParams.get("platform")
  const search = searchParams.get("search")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const offset = (page - 1) * PAGE_SIZE

  let query = supabase
    .from("orders")
    .select("id, platform, platform_code, platform_order_id, account_id, empresa_id, company_name, libral_reference, customer_name, order_date, total, currency, status, payment_status, libral_status, export_error, last_export_attempt_at, sent_to_libral, libral_sent_at, cancelled_at", { count: "exact" })
    .order("order_date", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  // Apply filters
  switch (filter) {
    case "pending_export":
      query = query.eq("libral_status", "pending_export")
      break
    case "exported":
      query = query.eq("libral_status", "sent")
      break
    case "failed":
      query = query.eq("libral_status", "failed")
      break
    case "missing_ean":
      query = query.eq("libral_status", "export_blocked")
      break
    case "cancelled":
      query = query.in("libral_status", ["cancel_pending", "cancelled_in_erp", "cancel_failed", "cancelled_not_sent"])
      break
    case "not_sent":
      query = query.in("libral_status", ["not_ready", "pending_export", "export_blocked", "failed"])
      break
  }

  if (platformCode) {
    query = query.eq("platform_code", platformCode)
  }

  if (platform) {
    query = query.eq("platform", platform)
  }

  if (from) {
    query = query.gte("order_date", from)
  }
  if (to) {
    query = query.lte("order_date", to)
  }

  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,platform_order_id.ilike.%${search}%,libral_reference.ilike.%${search}%`)
  }

  const { data: orders, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orders: orders ?? [],
    pagination: {
      total: count ?? 0,
      page,
      page_size: PAGE_SIZE,
      total_pages: Math.ceil((count ?? 0) / PAGE_SIZE),
    },
  })
}
