import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const ML_API_BASE = "https://api.mercadolibre.com"
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface MLOrderItem {
  item: { id: string; title: string; seller_sku?: string }
  quantity: number
  unit_price: number
}

interface MLOrder {
  id: number
  status: string
  date_created: string
  date_closed: string | null
  total_amount: number
  order_items: MLOrderItem[]
}

export async function GET(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { itemId } = params
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!itemId) {
      return NextResponse.json({ error: "itemId es requerido" }, { status: 400 })
    }

    // ── 1. Stock history desde nuestra BD ──────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()

    let stockQuery = supabase
      .from("ml_stock_history")
      .select(`
        id,
        ml_item_id,
        account_id,
        old_quantity,
        new_quantity,
        changed_by_user_id,
        source,
        notes,
        created_at
      `)
      .eq("ml_item_id", itemId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100)

    if (accountId) {
      stockQuery = stockQuery.eq("account_id", accountId)
    }

    const { data: stockHistory, error: stockError } = await stockQuery

    if (stockError) {
      console.error("[history] Error fetching stock history:", stockError)
    }

    // ── 2. Ventas desde ML API ─────────────────────────────────────────────
    let orders: MLOrder[] = []

    try {
      // Obtener cuenta ML (la del usuario actual)
      let accountQuery = supabase
        .from("ml_accounts")
        .select("id, ml_user_id, access_token, nickname")
        .eq("user_id", user.id)

      if (accountId) {
        accountQuery = accountQuery.eq("id", accountId)
      }

      const { data: accounts } = await accountQuery.limit(1)
      const account = accounts?.[0]

      if (account) {
        // Consultar órdenes recientes del vendedor en ML
        // ML no tiene filtro por item en /orders/search, filtramos server-side
        const dateFrom = new Date(Date.now() - SEVEN_DAYS_MS).toISOString().split("T")[0]
        const mlUrl = `${ML_API_BASE}/orders/search?seller=${account.ml_user_id}&sort=date_desc&limit=100&date_from=${dateFrom}`

        const mlResp = await fetch(mlUrl, {
          headers: { Authorization: `Bearer ${account.access_token}` },
        })

        if (mlResp.ok) {
          const mlData = await mlResp.json()
          const allOrders: MLOrder[] = mlData.results || []

          // Filtrar solo las órdenes que contienen este item
          orders = allOrders.filter((o) =>
            o.order_items?.some((oi) => oi.item?.id === itemId)
          )
        } else {
          console.error("[history] ML API error:", mlResp.status, await mlResp.text())
        }
      }
    } catch (mlError) {
      console.error("[history] Error fetching ML orders:", mlError)
      // No hacemos throw - devolvemos el historial local sin ventas si ML falla
    }

    // ── 3. Formatear ventas para el cliente ───────────────────────────────
    const sales = orders.map((o) => {
      const itemLine = o.order_items.find((oi) => oi.item?.id === itemId)
      return {
        order_id:     o.id,
        status:       o.status,
        date:         o.date_created,
        qty_sold:     itemLine?.quantity ?? 0,
        unit_price:   itemLine?.unit_price ?? 0,
        total_amount: o.total_amount,
      }
    })

    return NextResponse.json({
      item_id:       itemId,
      stock_history: stockHistory ?? [],
      sales,
      period_days:   7,
    })
  } catch (error) {
    console.error("[history] Unexpected error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
