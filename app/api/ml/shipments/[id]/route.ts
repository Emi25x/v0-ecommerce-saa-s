import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const shipmentId = id
    console.log(`[v0] === ML Shipment Status API called for shipment: ${shipmentId} ===`)

    // Create Supabase client
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Get ML account
    const { data: accounts, error: accountError } = await supabase.from("ml_accounts").select("*").limit(1).single()

    if (accountError || !accounts) {
      console.error("[v0] No ML account found:", accountError)
      return NextResponse.json({ error: "No ML account found" }, { status: 404 })
    }

    // Check if token needs refresh
    let accessToken = accounts.access_token
    const tokenExpiresAt = new Date(accounts.token_expires_at)
    const now = new Date()

    if (tokenExpiresAt <= now) {
      console.log("[v0] Access token expired, refreshing...")
      const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.MERCADOLIBRE_CLIENT_ID!,
          client_secret: process.env.MERCADOLIBRE_CLIENT_SECRET!,
          refresh_token: accounts.refresh_token,
        }),
      })

      if (!refreshResponse.ok) {
        console.error("[v0] Failed to refresh token:", refreshResponse.status)
        return NextResponse.json({ error: "Failed to refresh token" }, { status: 401 })
      }

      const refreshData = await refreshResponse.json()
      accessToken = refreshData.access_token

      // Update token in database
      await supabase
        .from("ml_accounts")
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        })
        .eq("id", accounts.id)
    }

    console.log(`[v0] Fetching shipment status for: ${shipmentId}`)
    const shipmentResponse = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!shipmentResponse.ok) {
      const contentType = shipmentResponse.headers.get("content-type")
      if (contentType?.includes("application/json")) {
        const errorData = await shipmentResponse.json()
        console.error("[v0] Error fetching shipment from ML (JSON):", shipmentResponse.status, errorData)
      } else {
        const errorText = await shipmentResponse.text()
        console.error("[v0] Error fetching shipment from ML (non-JSON):", shipmentResponse.status, errorText)
      }

      return NextResponse.json(
        {
          error: "Failed to fetch shipment from MercadoLibre",
          status: shipmentResponse.status,
        },
        { status: shipmentResponse.status },
      )
    }

    // Check content-type before parsing
    const contentType = shipmentResponse.headers.get("content-type")
    if (!contentType?.includes("application/json")) {
      const responseText = await shipmentResponse.text()
      console.error("[v0] Unexpected response format (not JSON):", responseText)
      return NextResponse.json(
        {
          error: "Unexpected response format from MercadoLibre",
          details: responseText.substring(0, 100),
        },
        { status: 500 },
      )
    }

    const shipmentData = await shipmentResponse.json()
    console.log(`[v0] Shipment status fetched successfully:`, {
      id: shipmentData.id,
      status: shipmentData.status,
      substatus: shipmentData.substatus,
    })

    return NextResponse.json({
      id: shipmentData.id,
      status: shipmentData.status,
      substatus: shipmentData.substatus,
      status_history: shipmentData.status_history,
    })
  } catch (error) {
    console.error("[v0] Error in shipment status endpoint:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}
