import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  console.log("[v0] ===== PAYMENTS ENDPOINT EXECUTING =====")

  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")
    const accountId = searchParams.get("account_id")
    const status = searchParams.get("status")
    const releaseStatus = searchParams.get("release_status")
    const dateFrom = searchParams.get("date_from")
    const dateTo = searchParams.get("date_to")
    const paymentMethod = searchParams.get("payment_method")

    console.log("[v0] Payments - Params:", { accountId, status, releaseStatus })

    let accountsQuery = supabase.from("ml_accounts").select("*")

    if (accountId && accountId !== "all") {
      accountsQuery = accountsQuery.eq("id", accountId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error("[v0] Error fetching ML accounts:", accountsError)
      return NextResponse.json({ error: "Failed to fetch ML accounts" }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      console.log("[v0] Payments - No accounts found")
      return NextResponse.json({ payments: [], paging: { total: 0, limit, offset } })
    }

    console.log("[v0] Payments - Found accounts:", accounts.length)

    const allPayments: any[] = []

    for (const account of accounts) {
      console.log(`[v0] Payments - Processing account: ${account.nickname}`)

      try {
        const maxPages = 10
        const ordersPerPage = 50

        for (let page = 0; page < maxPages; page++) {
          const mlParams = new URLSearchParams({
            seller: account.ml_user_id,
            limit: ordersPerPage.toString(),
            offset: (page * ordersPerPage).toString(),
            sort: "date_desc",
          })

          if (dateFrom) {
            mlParams.append("order.date_created.from", new Date(dateFrom).toISOString())
          }

          if (dateTo) {
            mlParams.append("order.date_created.to", new Date(dateTo).toISOString())
          }

          const mlResponse = await fetch(`https://api.mercadolibre.com/orders/search?${mlParams.toString()}`, {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
            },
          })

          if (!mlResponse.ok) {
            console.error(`[v0] Error fetching orders for account ${account.nickname}:`, mlResponse.status)
            continue
          }

          const mlData = await mlResponse.json()
          console.log(
            `[v0] Payments - Page ${page + 1}/${maxPages}: Received ${mlData.results?.length || 0} orders for ${account.nickname}`,
          )

          if (!mlData.results || mlData.results.length === 0) {
            break
          }

          if (mlData.results && Array.isArray(mlData.results)) {
            for (const order of mlData.results) {
              if (order.payments && Array.isArray(order.payments)) {
                let totalSaleFee = 0
                if (order.order_items && Array.isArray(order.order_items)) {
                  totalSaleFee = order.order_items.reduce((sum: number, item: any) => {
                    return sum + (item.sale_fee || 0)
                  }, 0)
                }

                for (const payment of order.payments) {
                  const transactionAmount = payment.transaction_amount || 0
                  const marketplaceFee = totalSaleFee / order.payments.length
                  const shippingCost = payment.shipping_cost || 0
                  const taxesAmount = payment.taxes_amount || 0
                  const refundedAmount = payment.transaction_amount_refunded || 0
                  const netReceived = transactionAmount - marketplaceFee - taxesAmount - refundedAmount

                  allPayments.push({
                    ...payment,
                    order_id: order.id,
                    account_id: account.id,
                    marketplace_fee: marketplaceFee,
                    net_received_amount: netReceived,
                    _account: {
                      nickname: account.nickname || account.ml_user_id,
                    },
                    order: {
                      id: order.id,
                      type: order.order_type,
                    },
                  })
                }
              }
            }
          }

          if (mlData.results.length < ordersPerPage) {
            break
          }
        }
      } catch (error) {
        console.error(`[v0] Error processing payments for account ${account.nickname}:`, error)
      }
    }

    console.log(`[v0] Payments - Total payments extracted: ${allPayments.length}`)

    let filteredPayments = allPayments

    if (status && status !== "all") {
      filteredPayments = filteredPayments.filter((p) => p.status === status)
    }

    if (releaseStatus && releaseStatus !== "all") {
      filteredPayments = filteredPayments.filter((p) => p.money_release_status === releaseStatus)
    }

    if (paymentMethod && paymentMethod !== "all") {
      filteredPayments = filteredPayments.filter((p) => p.payment_type_id === paymentMethod)
    }

    console.log(`[v0] Payments - After filters: ${filteredPayments.length}`)

    filteredPayments.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())

    const paginatedPayments = filteredPayments.slice(offset, offset + limit)

    return NextResponse.json({
      payments: paginatedPayments,
      paging: {
        total: filteredPayments.length,
        limit,
        offset,
      },
    })
  } catch (error) {
    console.error("[v0] Error in payments API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
