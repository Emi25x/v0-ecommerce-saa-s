import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken, getMercadoLibreShipments } from "@/lib/mercadolibre"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const supabase = await createClient()

    const { data: accounts, error: accountsError } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, nickname, access_token")
      .order("created_at", { ascending: false })

    if (accountsError) {
      console.error("[v0] Error fetching ML accounts:", accountsError)
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        shipments: [],
        paging: { total: 0, limit: 50, offset: 0 },
      })
    }

    const accountIdParam = searchParams.get("account_id")
    const accountsToFetch = accountIdParam ? accounts.filter((acc) => acc.id.toString() === accountIdParam) : accounts

    const filters = {
      status: searchParams.get("status") || undefined,
      date_from: searchParams.get("date_from") || undefined,
      date_to: searchParams.get("date_to") || undefined,
      limit: Number.parseInt(searchParams.get("limit") || "50"),
      offset: Number.parseInt(searchParams.get("offset") || "0"),
    }

    console.log("[v0] ML Shipments - Fetching shipments with filters:", filters)
    console.log(
      "[v0] ML Shipments - Fetching for accounts:",
      accountsToFetch.map((a) => a.nickname),
    )

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const allShipments: any[] = []
    let totalCount = 0

    for (const account of accountsToFetch) {
      try {
        const accessToken = await getValidAccessToken(account.ml_user_id)
        const shipmentsData = await getMercadoLibreShipments(accessToken, account.ml_user_id, filters)

        const shipmentsWithAccount = (shipmentsData.results || []).map((shipment: any) => ({
          ...shipment,
          account_id: account.id,
          account_nickname: account.nickname,
        }))

        allShipments.push(...shipmentsWithAccount)
        totalCount += shipmentsData.paging?.total || 0

        console.log(
          `[v0] ML Shipments - Retrieved ${shipmentsData.results?.length || 0} shipments from account ${account.nickname}`,
        )
      } catch (error: any) {
        const errorMessage = error.message || String(error)
        console.error(`[v0] ML Shipments - Error fetching from account ${account.nickname}:`, errorMessage)
      }
    }

    allShipments.sort((a, b) => {
      const dateA = new Date(a.date_created || 0).getTime()
      const dateB = new Date(b.date_created || 0).getTime()
      return dateB - dateA
    })

    console.log(`[v0] ML Shipments - Total shipments fetched: ${allShipments.length}`)

    return NextResponse.json({
      shipments: allShipments,
      paging: { total: totalCount, limit: filters.limit, offset: filters.offset },
    })
  } catch (error: any) {
    console.error("[v0] ML Shipments - Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch shipments", details: errorMessage }, { status: 500 })
  }
}
