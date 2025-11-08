import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Verificar que la petición viene de Vercel Cron
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Running automated competition analysis...")

    // Llamar al endpoint de análisis
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_VERCEL_URL || "http://localhost:3000"}/api/optimization/analyze-competition`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: null, // Analizar todas las cuentas
          search_term: null, // Analizar todos los productos
        }),
      },
    )

    const data = await response.json()

    console.log("[v0] Automated analysis complete:", data.stats)

    return NextResponse.json({
      success: true,
      stats: data.stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error in automated analysis:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
