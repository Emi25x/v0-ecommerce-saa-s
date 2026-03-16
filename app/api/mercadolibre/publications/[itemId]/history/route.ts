import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

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

    // ── 2. Obtener cuenta ML (compatible con cuentas sin user_id) ──────────
    let account: { id: string; ml_user_id: string; nickname: string } | null = null

    try {
      let accountQuery = supabase
        .from("ml_accounts")
        .select("id, ml_user_id, nickname")
        // Include accounts owned by this user OR old accounts without user_id
        .or(`user_id.eq.${user.id},user_id.is.null`)

      if (accountId) {
        accountQuery = accountQuery.eq("id", accountId)
      }

      const { data: accounts } = await accountQuery.limit(1)
      account = accounts?.[0] ?? null
    } catch (err) {
      console.error("[history] Error fetching ML account:", err)
    }

    // ── 3. Snapshot actual del item desde ML API ───────────────────────────
    let mlItemSnapshot: {
      available_quantity: number | null
      price: number | null
      status: string | null
    } | null = null

    if (account) {
      try {
        const token = await getValidAccessToken(account.id)
        const itemResp = await fetch(`${ML_API_BASE}/items/${itemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (itemResp.ok) {
          const itemData = await itemResp.json()
          mlItemSnapshot = {
            available_quantity: itemData.available_quantity ?? null,
            price: itemData.price ?? null,
            status: itemData.status ?? null,
          }
        } else {
          console.error("[history] ML item fetch error:", itemResp.status)
        }
      } catch (err) {
        console.error("[history] Error fetching ML item snapshot:", err)
      }
    }

    // ── 4. Ventas desde ML API ─────────────────────────────────────────────
    let orders: MLOrder[] = []
    const sevenDaysAgoDate = new Date(Date.now() - SEVEN_DAYS_MS)

    if (account) {
      try {
        const token = await getValidAccessToken(account.id)

        // ML /orders/search no soporta date_from como parámetro — filtramos client-side
        const mlUrl = `${ML_API_BASE}/orders/search?seller=${account.ml_user_id}&sort=date_desc&limit=200`

        const mlResp = await fetch(mlUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (mlResp.ok) {
          const mlData = await mlResp.json()
          const allOrders: MLOrder[] = mlData.results || []

          // Filtrar por item Y por fecha (últimos 7 días)
          orders = allOrders.filter((o) => {
            const orderDate = new Date(o.date_created)
            return (
              orderDate >= sevenDaysAgoDate &&
              o.order_items?.some((oi) => oi.item?.id === itemId)
            )
          })
        } else {
          console.error("[history] ML API error:", mlResp.status, await mlResp.text())
        }
      } catch (mlError) {
        console.error("[history] Error fetching ML orders:", mlError)
        // No hacemos throw - devolvemos el historial local sin ventas si ML falla
      }
    }

    // ── 5. Formatear ventas para el cliente ───────────────────────────────
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
      item_id:        itemId,
      stock_history:  stockHistory ?? [],
      ml_snapshot:    mlItemSnapshot,
      sales,
      period_days:    7,
    })
  } catch (error) {
    console.error("[history] Unexpected error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
