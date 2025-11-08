import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  console.log("[v0] ===== ORDERS ENDPOINT EXECUTING =====")

  try {
    const { createClient } = await import("@/lib/supabase/server")
    console.log("[v0] Orders - Imported createClient")

    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get("account_id")
    const orderId = searchParams.get("order_id")

    console.log("[v0] Orders - Params:", { accountId, orderId })

    const supabase = await createClient()
    console.log("[v0] Orders - Supabase client created")

    let accountsQuery = supabase.from("ml_accounts").select("*")
    if (accountId && accountId !== "all") {
      accountsQuery = accountsQuery.eq("id", accountId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error("[v0] Orders - Database error:", accountsError)
      return NextResponse.json({ error: "Database error", details: accountsError.message }, { status: 500 })
    }

    console.log("[v0] Orders - Found accounts:", accounts?.length || 0)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        orders: [],
        paging: { total: 0, limit: 0, offset: 0 },
      })
    }

    if (orderId) {
      console.log(`[v0] Orders - Fetching specific order: ${orderId}`)

      for (const account of accounts) {
        try {
          const url = `https://api.mercadolibre.com/orders/${orderId}`
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${account.access_token}` },
          })

          if (response.ok) {
            const order = await response.json()
            console.log(`[v0] Orders - Found order ${orderId}`)

            if (order.shipping?.id) {
              try {
                const shipmentResponse = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, {
                  headers: { Authorization: `Bearer ${account.access_token}` },
                })
                if (shipmentResponse.ok) {
                  const shipmentData = await shipmentResponse.json()
                  order.shipping = {
                    ...order.shipping,
                    status: shipmentData.status,
                    substatus: shipmentData.substatus,
                    mode: shipmentData.mode,
                  }
                }
              } catch (error) {
                console.error(`[v0] Orders - Error loading shipment:`, error)
              }
            }

            return NextResponse.json({
              orders: [
                {
                  ...order,
                  account_id: account.id,
                  account_nickname: account.nickname || account.ml_user_id,
                },
              ],
              paging: { total: 1, limit: 1, offset: 0 },
            })
          }
        } catch (error: any) {
          console.error(`[v0] Orders - Error fetching order ${orderId}:`, error.message)
        }
      }

      return NextResponse.json({
        orders: [],
        paging: { total: 0, limit: 0, offset: 0 },
      })
    }

    const allOrders: any[] = []

    for (const account of accounts) {
      console.log(`[v0] Orders - Processing account: ${account.nickname}`)

      try {
        let offset = 0
        const limit = 50
        let hasMore = true

        while (hasMore) {
          const params = new URLSearchParams({
            seller: account.ml_user_id,
            limit: limit.toString(),
            offset: offset.toString(),
            sort: "date_desc",
          })

          const url = `https://api.mercadolibre.com/orders/search?${params.toString()}`

          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${account.access_token}` },
          })

          console.log(`[v0] Orders - ML API status: ${response.status} (offset: ${offset})`)

          if (!response.ok) {
            console.error(`[v0] Orders - ML API error: ${response.status}`)
            break
          }

          const data = await response.json()
          console.log(`[v0] Orders - Received ${data.results?.length || 0} orders (offset: ${offset})`)

          if (data.results && Array.isArray(data.results) && data.results.length > 0) {
            const enrichedOrders = await Promise.all(
              data.results.map(async (order: any) => {
                if (order.shipping?.id) {
                  try {
                    const shipmentResponse = await fetch(
                      `https://api.mercadolibre.com/shipments/${order.shipping.id}`,
                      {
                        headers: { Authorization: `Bearer ${account.access_token}` },
                      },
                    )

                    if (shipmentResponse.ok) {
                      const shipmentData = await shipmentResponse.json()
                      order.shipping = {
                        ...order.shipping,
                        status: shipmentData.status,
                        substatus: shipmentData.substatus,
                        mode: shipmentData.mode,
                      }
                    }
                  } catch (error) {
                    console.error(`[v0] Orders - Error loading shipment ${order.shipping.id}:`, error)
                  }
                }

                return {
                  ...order,
                  account_id: account.id,
                  account_nickname: account.nickname || account.ml_user_id,
                }
              }),
            )

            allOrders.push(...enrichedOrders)

            if (data.results.length < limit || !data.paging || offset + limit >= data.paging.total) {
              hasMore = false
            } else {
              offset += limit
            }
          } else {
            hasMore = false
          }
        }
      } catch (error: any) {
        console.error(`[v0] Orders - Error:`, error.message)
        continue
      }
    }

    console.log(`[v0] Orders - Total orders loaded: ${allOrders.length}`)

    allOrders.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())

    return NextResponse.json({
      orders: allOrders,
      paging: { total: allOrders.length, limit: allOrders.length, offset: 0 },
    })
  } catch (error: any) {
    console.error("[v0] Orders - FATAL ERROR:", error.message)
    console.error("[v0] Orders - Stack:", error.stack)

    return NextResponse.json(
      { error: "Internal server error", message: error.message, stack: error.stack },
      { status: 500 },
    )
  }
}
