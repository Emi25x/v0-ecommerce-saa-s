import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const itemId = params.id
    console.log("[v0] Fetching SKU for item:", itemId)

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {}
          },
        },
      },
    )

    // Get ML account to fetch access token
    const { data: account } = await supabase.from("ml_accounts").select("*").limit(1).single()

    if (!account) {
      return NextResponse.json({ error: "No MercadoLibre account found" }, { status: 404 })
    }

    let retries = 3
    let lastError: any = null

    while (retries > 0) {
      try {
        const response = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
          headers: {
            Authorization: `Bearer ${account.access_token}`,
          },
        })

        if (response.status === 429) {
          // Rate limited, wait and retry
          console.log(`[v0] Rate limited, retrying... (${retries} retries left)`)
          await new Promise((resolve) => setTimeout(resolve, 2000))
          retries--
          continue
        }

        if (!response.ok) {
          const contentType = response.headers.get("content-type")
          if (contentType?.includes("application/json")) {
            try {
              const errorData = await response.json()
              console.error("[v0] Error fetching item from ML (JSON):", response.status, errorData)
              return NextResponse.json(
                { error: "Failed to fetch item from MercadoLibre", details: errorData },
                { status: response.status },
              )
            } catch (e) {
              console.error("[v0] Error parsing JSON error response:", e)
            }
          } else {
            const errorText = await response.text()
            console.error("[v0] Error fetching item from ML (non-JSON):", response.status, errorText)
            return NextResponse.json(
              { error: "Failed to fetch item from MercadoLibre", details: errorText },
              { status: response.status },
            )
          }
        }

        const contentType = response.headers.get("content-type")
        if (!contentType?.includes("application/json")) {
          const textResponse = await response.text()
          console.error("[v0] Unexpected non-JSON response:", textResponse)
          return NextResponse.json(
            { error: "Unexpected response format from MercadoLibre", details: textResponse },
            { status: 500 },
          )
        }

        const item = await response.json()

        // Extract SKU from attributes
        const sellerSkuAttr = item.attributes?.find((attr: any) => attr.id === "SELLER_SKU")
        const sellerSku = sellerSkuAttr?.value_name || null

        console.log("[v0] Extracted SKU:", sellerSku, "for item:", itemId)

        return NextResponse.json({
          item_id: itemId,
          seller_sku: sellerSku,
          title: item.title,
          thumbnail: item.thumbnail,
          cached: false,
        })
      } catch (error) {
        lastError = error
        console.error(`[v0] Error fetching item (${retries} retries left):`, error)
        retries--
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
    }

    // All retries failed
    console.error("[v0] All retries failed for item:", itemId, lastError)
    return NextResponse.json(
      {
        error: "Failed to fetch item after retries",
        details: lastError instanceof Error ? lastError.message : String(lastError),
      },
      { status: 500 },
    )
  } catch (error) {
    console.error("[v0] Error in SKU endpoint:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
