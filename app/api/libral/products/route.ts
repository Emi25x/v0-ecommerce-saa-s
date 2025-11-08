import { type NextRequest, NextResponse } from "next/server"
import { getLibralProducts, queryLibralProducts } from "@/lib/libral"

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("libral_access_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated with Libral" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "0")
    let pageSize = Number.parseInt(searchParams.get("pageSize") || "50")

    if (pageSize > 1000) {
      console.warn(`[v0] Libral Products - PageSize ${pageSize} excede el máximo (1000). Ajustando...`)
      pageSize = 1000
    }

    if (pageSize <= 0) {
      pageSize = 50
    }

    const ean = searchParams.get("ean")

    console.log("[v0] Libral Products - Page:", page, "PageSize:", pageSize)

    let result

    if (ean) {
      // Search by specific EAN
      result = await queryLibralProducts(token, {
        take: 1,
        filter: ["ean", "=", ean],
        select: [
          "id",
          "ean",
          "titulo",
          "subtitulo",
          "activo",
          "precioventa",
          "stockfirmetotal",
          "stockdisponibletotal",
          "urlfotografia",
          "resumen",
          "sinopsis",
          "nombreproveedor",
          "nombreeditorial",
        ],
      })
    } else {
      // Get all products with pagination
      result = await getLibralProducts(page, pageSize)
    }

    console.log("[v0] Libral Products - Retrieved:", result.data.length, "products")
    console.log("[v0] Libral Products - Total:", result.totalCount)

    return NextResponse.json({
      products: result.data,
      totalCount: result.totalCount,
      page,
      pageSize,
    })
  } catch (error) {
    console.error("[v0] Libral products error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch Libral products", details: errorMessage }, { status: 500 })
  }
}
