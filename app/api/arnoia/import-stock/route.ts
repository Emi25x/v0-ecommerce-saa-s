import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeEan } from "@/lib/ean-utils"
import Papa from "papaparse"

export const maxDuration = 300 // 5 minutos

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const startTime = Date.now()
  
  console.log("[v0] ARNOIA Stock Update - Starting")

  try {
    // Verificar autenticación (permitir cron sin auth)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    // Obtener configuración de ARNOIA
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .eq("name", "ARNOIA")
      .eq("is_active", true)
      .single()

    if (!source) {
      return NextResponse.json({ error: "ARNOIA source not configured or inactive" }, { status: 400 })
    }

    const credentials = source.credentials as { login: string; pass: string; url: string }
    if (!credentials?.url) {
      return NextResponse.json({ error: "ARNOIA URL missing" }, { status: 400 })
    }

    // Descargar CSV de ARNOIA
    console.log("[v0] Fetching ARNOIA stock from:", credentials.url)
    const response = await fetch(credentials.url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ARNOIA stock: ${response.status}`)
    }

    const csvText = await response.text()
    
    // Parsear CSV usando Papa Parse
    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: ";",
      encoding: "ISO-8859-1"
    })

    const rows = parseResult.data as any[]
    console.log("[v0] Parsed rows:", rows.length)

    let processed = 0
    let updated = 0
    let notFound = 0
    let errors = 0

    // Procesar cada fila
    for (const row of rows) {
      const eanRaw = row["EAN"] || row["ean"] || row["ean13"]
      const ean = normalizeEan(eanRaw)

      if (!ean || ean.length !== 13) {
        errors++
        continue
      }

      const stock = parseInt(row["STOCK"] || row["stock"] || row["Stock"]) || 0
      const costPrice = parseFloat(row["PRECIO"] || row["precio"] || row["Precio"]) || null

      // Actualizar SOLO stock_by_source.arnoia y cost_price
      const updateData: any = {
        stock_by_source: {
          arnoia: stock
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

      // Log progreso cada 500 productos
      if (processed % 500 === 0) {
        console.log(`[v0] Progress: ${processed} processed, ${updated} updated`)
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

    console.log("[v0] ARNOIA Stock Update - Completed")
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
    console.error("[v0] ARNOIA Stock Update - Error:", error)
    
    // Actualizar estado a error
    const { data: source } = await supabase
      .from("import_sources")
      .select("id")
      .eq("name", "ARNOIA")
      .single()
    
    if (source) {
      await supabase
        .from("import_sources")
        .update({
          last_run: new Date().toISOString(),
          last_status: "error"
        })
        .eq("id", source.id)
    }

    return NextResponse.json(
      { error: error.message || "Stock update failed" },
      { status: 500 }
    )
  }
}
