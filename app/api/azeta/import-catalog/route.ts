import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeEan } from "@/lib/ean-utils"

export const maxDuration = 300 // 5 minutos

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const startTime = Date.now()
  
  console.log("[v0] AZETA Catalog Import - Starting")

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

    // Descargar catálogo completo de AZETA
    const catalogUrl = "https://www.azeta.es/stock_xml_ext/emi/stock.csv"
    console.log("[v0] Fetching AZETA catalog from:", catalogUrl)

    const response = await fetch(catalogUrl, {
      headers: {
        "Authorization": `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch AZETA catalog: ${response.status} ${response.statusText}`)
    }

    const csvText = await response.text()
    const lines = csvText.split("\n")
    const headers = lines[0].split("|").map(h => h.trim())
    
    console.log("[v0] CSV Headers:", headers)
    console.log("[v0] Total lines:", lines.length)

    // Mapeo de campos AZETA
    const eanIdx = headers.indexOf("ean")
    const titleIdx = headers.indexOf("titulo")
    const authorIdx = headers.indexOf("autor")
    const publisherIdx = headers.indexOf("editorial")
    const priceIdx = headers.indexOf("pvp")
    const costIdx = headers.indexOf("precio")
    const stockIdx = headers.indexOf("stock")
    const isbnIdx = headers.indexOf("isbn")

    let processed = 0
    let updated = 0
    let created = 0
    let errors = 0
    const batchSize = 50

    // Procesar en lotes
    for (let i = 1; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize)
      const upserts = []

      for (const line of batch) {
        if (!line.trim()) continue

        const fields = line.split("|")
        const eanRaw = fields[eanIdx] || fields[isbnIdx]
        const ean = normalizeEan(eanRaw)

        if (!ean || ean.length !== 13) {
          errors++
          continue
        }

        const stock = parseInt(fields[stockIdx]) || 0
        
        upserts.push({
          ean,
          title: fields[titleIdx]?.trim() || null,
          author: fields[authorIdx]?.trim() || null,
          brand: fields[publisherIdx]?.trim() || null,
          price: parseFloat(fields[priceIdx]) || 0,
          cost_price: parseFloat(fields[costIdx]) || 0,
          language: "SPA",
          source: "azeta",
          last_import: new Date().toISOString(),
          stock_by_source: {
            azeta: stock
          }
        })
        processed++
      }

      if (upserts.length > 0) {
        const { data, error } = await supabase
          .from("products")
          .upsert(upserts, { 
            onConflict: "ean",
            ignoreDuplicates: false 
          })
          .select("id")

        if (error) {
          console.error("[v0] Batch upsert error:", error)
          errors += upserts.length
        } else {
          created += data?.length || 0
        }
      }

      // Log progreso cada 500 productos
      if (processed % 500 === 0) {
        console.log(`[v0] Progress: ${processed} products processed`)
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

    console.log("[v0] AZETA Catalog Import - Completed")
    console.log(`[v0] Stats: ${processed} processed, ${created} created/updated, ${errors} errors in ${duration}s`)

    return NextResponse.json({
      success: true,
      stats: {
        processed,
        created,
        updated,
        errors,
        duration_seconds: parseFloat(duration)
      }
    })

  } catch (error: any) {
    console.error("[v0] AZETA Catalog Import - Error:", error)
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 }
    )
  }
}
