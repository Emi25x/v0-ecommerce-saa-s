import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")
    const status = searchParams.get("status") || "all"
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    console.log("[v0] GET /api/mercadolibre/orders - account:", accountId, "status:", status)

    // Si account_id es "all", obtener todas las cuentas
    if (accountId === "all" || !accountId) {
      // Obtener todas las cuentas y combinar sus órdenes
      const { data: accounts } = await supabase
        .from("ml_accounts")
        .select("id, ml_user_id, access_token, nickname")

      if (!accounts || accounts.length === 0) {
        return NextResponse.json({ orders: [], paging: { total: 0, limit, offset } })
      }

      // Por ahora, obtener órdenes desde cache para todas las cuentas
      let query = supabase.from("ml_orders").select("*", { count: "exact" })
      if (status !== "all") query = query.eq("status", status)
      
      const { data: allOrders, count } = await query
        .order("date_created", { ascending: false })
        .range(offset, offset + limit - 1)

      return NextResponse.json({
        orders: allOrders || [],
        paging: { total: count || 0, limit, offset },
        from_cache: true
      })
    }

    // Obtener cuenta específica para acceder a ML
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, access_token, nickname")
      .eq("id", accountId)
      .single()

    if (!account) {
      return NextResponse.json({ orders: [], paging: { total: 0, limit, offset } })
    }

    console.log("[v0] Fetching orders from ML for user:", account.ml_user_id)

    // Construir URL de búsqueda según el status
    let searchUrl = `https://api.mercadolibre.com/orders/search?seller=${account.ml_user_id}&limit=50&offset=${offset}`
    
    if (status !== "all") {
      searchUrl += `&order.status=${status}`
    }

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    if (!searchResponse.ok) {
      console.warn("[v0] ML API error, falling back to cache. Status:", searchResponse.status)
      // Si ML falla, usar cache de DB
      let query = supabase.from("ml_orders").select("*", { count: "exact" })
      if (accountId) query = query.eq("account_id", accountId)
      if (status !== "all") query = query.eq("status", status)
      
      const { data: cachedOrders, count } = await query
        .order("date_created", { ascending: false })
        .range(offset, offset + limit - 1)

      return NextResponse.json({
        orders: cachedOrders || [],
        paging: { total: count || 0, limit, offset },
        from_cache: true
      })
    }

    const searchData = await searchResponse.json()
    const orders = searchData.results || []
    const totalCount = searchData.paging?.total || 0

    console.log("[v0] Got", orders.length, "orders from ML. Total:", totalCount)

    // Guardar en cache para futuro uso si ML falla
    if (orders.length > 0) {
      for (const order of orders) {
        try {
          // Verificar si existe
          const { data: existing } = await supabase
            .from("ml_orders")
            .select("id")
            .eq("account_id", account.id)
            .eq("ml_order_id", order.id)
            .maybeSingle()

          if (existing) {
            // Actualizar
            await supabase.from("ml_orders").update({
              buyer_id: order.buyer.id,
              buyer_nickname: order.buyer.nickname,
              status: order.status,
              date_created: order.date_created,
              total_amount: order.total_amount,
              currency_id: order.currency_id,
              packing_status: order.packing_status,
              shipping_status: order.shipping_status,
              updated_at: new Date().toISOString()
            }).eq("id", existing.id)
          } else {
            // Crear nuevo
            await supabase.from("ml_orders").insert({
              account_id: account.id,
              ml_order_id: order.id,
              buyer_id: order.buyer.id,
              buyer_nickname: order.buyer.nickname,
              status: order.status,
              date_created: order.date_created,
              total_amount: order.total_amount,
              currency_id: order.currency_id,
              packing_status: order.packing_status,
              shipping_status: order.shipping_status
            })
          }
        } catch (err) {
          console.log("[v0] Cache write error for order", order.id, ":", err instanceof Error ? err.message : err)
        }
      }
    }

    return NextResponse.json({
      orders,
      paging: { total: totalCount, limit, offset },
      from_cache: false
    })
  } catch (error) {
    console.error("[v0] Error fetching orders:", error)
    
    // Último recurso: devolver datos de cache
    try {
      const supabase = await createClient()
      const accountId = new URL(request.url).searchParams.get("account_id")
      const { data: cachedOrders } = await supabase
        .from("ml_orders")
        .select("*")
        .eq("account_id", accountId)
        .order("date_created", { ascending: false })
        .limit(50)

      return NextResponse.json({
        orders: cachedOrders || [],
        paging: { total: cachedOrders?.length || 0, limit: 50, offset: 0 },
        from_cache: true,
        error: "Using cache due to API error"
      })
    } catch {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown error", orders: [], paging: { total: 0, limit: 50, offset: 0 } },
        { status: 500 }
      )
    }
  }
}
