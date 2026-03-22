import { type NextRequest, NextResponse } from "next/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_API_BASE = "https://api.mercadolibre.com"

export async function POST(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated with Mercado Libre" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)

    const { product_ids, updates } = await request.json()

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json({ error: "product_ids is required and must be an array" }, { status: 400 })
    }

    console.log("[v0] Bulk update - Products:", product_ids.length, "Updates:", updates)

    const results = []
    const errors = []

    for (const productId of product_ids) {
      try {
        const response = await fetch(`${ML_API_BASE}/items/${productId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        })

        if (response.ok) {
          const data = await response.json()
          results.push({ id: productId, success: true })
          console.log("[v0] Updated product:", productId)
        } else {
          const errorData = await response.json()
          errors.push({ id: productId, error: errorData })
          console.error("[v0] Failed to update product:", productId, errorData)
        }
      } catch (error) {
        errors.push({ id: productId, error: String(error) })
        console.error("[v0] Error updating product:", productId, error)
      }
    }

    return NextResponse.json({
      success: true,
      updated: results.length,
      failed: errors.length,
      results,
      errors,
    })
  } catch (error) {
    console.error("[v0] Bulk update error:", error)
    return NextResponse.json({ error: "Failed to update products" }, { status: 500 })
  }
}
