import { createClient } from "@/lib/db/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Orders endpoint v3.1 - START")

    const searchParams = request.nextUrl.searchParams
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")
    const sort = searchParams.get("sort") || "date_desc"
    const dateFrom = searchParams.get("date_from")
    const dateTo = searchParams.get("date_to")
    const status = searchParams.get("status")
    const accountId = searchParams.get("account_id")

    console.log("[v0] Orders endpoint - Params:", { limit, offset, sort, dateFrom, dateTo, status, accountId })

    const supabase = await createClient()
    console.log("[v0] Orders endpoint - Supabase client created")

    // Get ML accounts
    let accountsQuery = supabase.from("ml_accounts").select("*")

    if (accountId) {
      accountsQuery = accountsQuery.eq("id", accountId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery
    console.log("[v0] Orders endpoint - Accounts found:", accounts?.length || 0)

    if (accountsError) {
      console.error("[v0] Orders endpoint - Error fetching accounts:", accountsError)
      return Response.json({ error: "Failed to fetch accounts", details: accountsError.message }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      console.log("[v0] Orders endpoint - No accounts found")
      return Response.json({ orders: [], paging: { total: 0, limit, offset } })
    }

    const allOrders: any[] = []
    let totalOrders = 0

    for (const account of accounts) {
      try {
        console.log(`[v0] Orders endpoint - Fetching orders for account: ${account.nickname}`)

        // Build ML API URL
        let mlUrl = `https://api.mercadolibre.com/orders/search?seller=${account.ml_user_id}&limit=${limit}&offset=${offset}`

        if (dateFrom) {
          mlUrl += `&order.date_created.from=${dateFrom}`
        }
        if (dateTo) {
          mlUrl += `&order.date_created.to=${dateTo}`
        }
        if (status) {
          mlUrl += `&order.status=${status}`
        }

        // Sort
        if (sort === "date_desc") {
          mlUrl += "&sort=date_desc"
        } else if (sort === "date_asc") {
          mlUrl += "&sort=date_asc"
        }

        console.log(`[v0] Orders endpoint - ML API URL: ${mlUrl}`)

        const response = await fetch(mlUrl, {
          headers: {
            Authorization: `Bearer ${account.access_token}`,
          },
        })

        console.log(`[v0] Orders endpoint - ML API response status: ${response.status}`)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[v0] Orders endpoint - ML API error for ${account.nickname}:`, errorText)
          continue
        }

        const data = await response.json()
        console.log(`[v0] Orders endpoint - Orders fetched for ${account.nickname}:`, data.results?.length || 0)
        console.log(`[v0] Orders endpoint - Total available for ${account.nickname}:`, data.paging?.total || 0)

        if (data.paging?.total) {
          totalOrders += data.paging.total
        }

        if (data.results && Array.isArray(data.results)) {
          // Add account info to each order
          const ordersWithAccount = data.results.map((order: any) => ({
            ...order,
            _account: {
              id: account.id,
              nickname: account.nickname,
            },
          }))
          allOrders.push(...ordersWithAccount)
        }
      } catch (error: any) {
        console.error(`[v0] Orders endpoint - Error fetching orders for ${account.nickname}:`, error.message)
      }
    }

    console.log(`[v0] Orders endpoint - Total orders fetched: ${allOrders.length}`)
    console.log(`[v0] Orders endpoint - Total orders available: ${totalOrders}`)

    // Sort orders
    if (sort === "date_desc") {
      allOrders.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())
    } else if (sort === "date_asc") {
      allOrders.sort((a, b) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime())
    }

    return Response.json({
      orders: allOrders,
      paging: {
        total: totalOrders,
        limit,
        offset,
      },
    })
  } catch (error: any) {
    console.error("[v0] Orders endpoint - Fatal error:", error)
    return Response.json(
      {
        error: "Internal server error",
        message: error.message,
        stack: error.stack,
      },
      { status: 500 },
    )
  }
}
