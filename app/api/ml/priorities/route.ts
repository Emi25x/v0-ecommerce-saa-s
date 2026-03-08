import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  try {
    const url          = new URL(req.url)
    const accountId    = url.searchParams.get("ml_account_id")
    const levelFilter  = url.searchParams.get("priority_level")
    const actionFilter = url.searchParams.get("recommended_action")
    const q            = url.searchParams.get("q")?.trim().toLowerCase()
    const limit        = Math.min(Number(url.searchParams.get("limit") ?? 200), 500)
    const offset       = Number(url.searchParams.get("offset") ?? 0)

    let query = supabase
      .from("ml_publish_priorities")
      .select(`
        *,
        products (
          id, title, author, isbn, ean, sku, stock, cost_price, price, image_url, category
        )
      `, { count: "exact" })
      .order("publish_priority_score", { ascending: false })
      .range(offset, offset + limit - 1)

    if (accountId && accountId !== "all") query = query.eq("ml_account_id", accountId)
    if (levelFilter)  query = query.eq("priority_level", levelFilter)
    if (actionFilter) query = query.eq("recommended_action", actionFilter)

    const { data, error, count } = await query
    if (error) throw error

    let rows = data ?? []

    // Client-side text filter (ISBN, title, author)
    if (q) {
      rows = rows.filter(r =>
        r.products?.title?.toLowerCase().includes(q) ||
        r.products?.author?.toLowerCase().includes(q) ||
        r.products?.isbn?.toLowerCase().includes(q) ||
        r.products?.sku?.toLowerCase().includes(q)
      )
    }

    return NextResponse.json({ ok: true, rows, total: count ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
