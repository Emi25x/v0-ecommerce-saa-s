import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeEan } from "@/lib/ean-utils"

export const maxDuration = 300 // 5 minutos

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const startTime = Date.now()
  
  console.log("[v0] AZETA Stock Update - Starting")

  try {
    // Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Obtener credenciales de AZETA
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .eq("name", "AZETA")
      .eq("is_active", true)
      .single()

    if (!source) {
      return NextResponse.json({ error: "AZETA source not configured or inactive" }, { status: 400 })
    }

    const credentials = source.credentials as { username: string; password: string }
    if (!credentials?.username || !credentials?.password) {
      return NextResponse.json({ error: "AZETA credentials missing" }, { status: 400 })
    }

    // Descargar solo stock de AZETA
    const stockUrl = "https://www.azeta.es/stock_xml_ext/emi/stock.csv"
    console.log("[v0] Fetching AZETA stock from:", stockUrl)

    const response = await fetch(stockUrl, {
      headers: {
        "Authorization": `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch AZETA stock: ${response.status} ${response.statusText}`)
    }

    const csvText = await response.text()
    const lines = csvText.split("\n")
    const headers = lines[0].split(";").map(h => h.trim())
    
    const eanIdx = headers.indexOf("ean")
    const isbnIdx = headers.indexOf("isbn")
    const stockIdx = headers.indexOf("stock")
    const priceIdx = headers.indexOf("precio")

    let processed = 0
    let updated = 0
    let errors = 0
    let notFound = 0

    // Procesar líneas individualmente para actualizaciones de stock
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue

      const fields = line.split(";")
      const eanRaw = fields[eanIdx] || fields[isbnIdx]
      const ean = normalizeEan(eanRaw)

      if (!ean || ean.length !== 13) {
        errors++
        continue
      }

      const stock = parseInt(fields[stockIdx]) || 0
      const costPrice = parseFloat(fields[priceIdx]) || null

      // Actualizar SOLO stock_by_source.azeta y cost_price
      const updateData: any = {
        stock_by_source: {
          azeta: stock
        }
      }

      if (costPrice !== null) {
        updateData.cost_price = costPrice
      }

      const { data, error } = await supabase
        .from("products")
        .update(updateData)
        .eq("ean", ean)
        .select("id")

      if (error) {
        console.error(`[v0] Error updating stock for EAN ${ean}:`, error)
        errors++
      } else if (data && data.length > 0) {
        updated++
      } else {
        notFound++
      }

      processed++

      // Log progreso cada 1000 productos
      if (processed % 1000 === 0) {
        console.log(`[v0] Progress: ${processed} processed, ${updated} updated, ${notFound} not found, ${errors} errors`)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Actualizar estado del source
    await supabase
      .from("import_sources")
      .update({
        last_run: new Date().toISOString(),
        last_status: "success"
      })
      .eq("id", source.id)

    console.log("[v0] AZETA Stock Update - Completed")
    console.log(`[v0] Stats: ${processed} processed, ${updated} updated, ${notFound} not found, ${errors} errors in ${duration}s`)

    return NextResponse.json({
      success: true,
      stats: {
        processed,
        updated,
        not_found: notFound,
        errors,
        duration_seconds: parseFloat(duration)
      }
    })

  } catch (error: any) {
    console.error("[v0] AZETA Stock Update - Error:", error)
    return NextResponse.json(
      { error: error.message || "Stock update failed" },
      { status: 500 }
    )
  }
}
