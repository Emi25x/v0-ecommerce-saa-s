import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { mergeStockBySource } from "@/lib/stock-helpers"
import { runLibralStockImport } from "@/lib/libral/run-stock-import"
import { runAzetaStockUpdate } from "@/lib/azeta/update-stock-import"

console.log("[v0] ========================================")
console.log("[v0] IMPORT-NOW ENDPOINT MODULE LOADED")
console.log("[v0] ========================================")

export async function GET(request: Request) {
  console.log("[v0] ========================================")
  console.log("[v0] GET /api/import-now - STARTING")
  console.log("[v0] ========================================")

  try {
    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get("sourceId")
    const sourceName = searchParams.get("source")

    console.log("[v0] Parameters:", { sourceId, sourceName })

    const supabase = await createClient()

    // Get source configuration
    let query = supabase.from("import_sources").select("*").eq("is_active", true)

    if (sourceId) {
      query = query.eq("id", sourceId)
    } else if (sourceName) {
      query = query.ilike("name", `%${sourceName}%`)
    }

    const { data: sources, error: sourceError } = await query

    if (sourceError) {
      console.error("[v0] Error fetching sources:", sourceError)
      return NextResponse.json({ error: sourceError.message }, { status: 500 })
    }

    if (!sources || sources.length === 0) {
      console.log("[v0] No sources found")
      return NextResponse.json({ error: "No sources found" }, { status: 404 })
    }

    console.log(
      "[v0] Found sources:",
      sources.map((s) => s.name),
    )

    const results = []

    for (const source of sources) {
      console.log(`[v0] ========================================`)
      console.log(`[v0] Processing source: ${source.name}`)
      console.log(`[v0] ========================================`)

      const sourceLower = (source.name ?? "").toLowerCase()

      // ── Azeta: CSV propio, delegar a runAzetaStockUpdate ──────────────────
      if (sourceLower.includes("azeta")) {
        console.log(`[v0] Azeta source detected, using runAzetaStockUpdate`)

        const { data: histRecord } = await supabase
          .from("import_history")
          .insert({ source_id: source.id, status: "running", started_at: new Date().toISOString() })
          .select().single()

        const r = await runAzetaStockUpdate(source as any)

        if (histRecord) {
          await supabase.from("import_history").update({
            status: r.success ? "success" : "error",
            completed_at: new Date().toISOString(),
            products_updated: r.updated ?? 0,
            products_failed: r.not_found ?? 0,
            error_message: r.error ?? null,
          }).eq("id", histRecord.id)
        }

        results.push({
          source: source.name,
          imported: 0,
          updated: r.updated ?? 0,
          failed: r.not_found ?? 0,
          total: r.updated ?? 0,
        })
        continue
      }

      // ── Arnoia: CSV latin1 + bulk_update_stock_price RPC ──────────────────
      if (sourceLower.includes("arnoia")) {
        console.log(`[v0] Arnoia source detected, calling dedicated import-stock`)

        const { data: histRecord } = await supabase
          .from("import_history")
          .insert({ source_id: source.id, status: "running", started_at: new Date().toISOString() })
          .select().single()

        let arnoiaUpdated = 0, arnoiaFailed = 0, arnoiaError: string | null = null
        try {
          const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : "http://localhost:3000"
          const res = await fetch(`${baseUrl}/api/arnoia/import-stock`, { method: "POST" })
          const data = await res.json()
          if (res.ok && data.success) {
            arnoiaUpdated = data.updated ?? 0
          } else {
            arnoiaError = data.error ?? `HTTP ${res.status}`
          }
        } catch (e: any) {
          arnoiaError = e.message
        }

        if (histRecord) {
          await supabase.from("import_history").update({
            status: arnoiaError ? "error" : "success",
            completed_at: new Date().toISOString(),
            products_updated: arnoiaUpdated,
            error_message: arnoiaError,
          }).eq("id", histRecord.id)
        }

        results.push({
          source: source.name,
          imported: 0,
          updated: arnoiaUpdated,
          failed: arnoiaFailed,
          total: arnoiaUpdated,
        })
        continue
      }

      // ── Libral: API JSON paginada (feed_type==="api" only) ───────────────
      // NOTE: "Libral Argentina" is feed_type="stock_price" and is handled by
      // the generic CSV path below (TAB-delimited text file).
      const isLibral = source.feed_type === "api"
      if (isLibral) {
        console.log(`[v0] Libral source detected, using runLibralStockImport`)

        // Create import_history record so the history tab shows the run
        const { data: histRecord } = await supabase
          .from("import_history")
          .insert({
            source_id: source.id,
            status: "running",
            started_at: new Date().toISOString(),
          })
          .select()
          .single()

        const r = await runLibralStockImport(source.source_key ?? "libral")

        // Update history with result
        if (histRecord) {
          await supabase
            .from("import_history")
            .update({
              status: r.success ? "success" : "error",
              completed_at: new Date().toISOString(),
              products_updated: r.updated,
              products_failed: r.errors,
              error_message: r.error ?? null,
            })
            .eq("id", histRecord.id)
        }

        results.push({
          source: source.name,
          imported: 0,
          updated: r.updated,
          failed: r.errors,
          total: r.updated,
        })
        continue
      }

      try {
        // Download CSV
        console.log(`[v0] Downloading CSV from: ${source.url_template}`)
        const csvResponse = await fetch(source.url_template)

        if (!csvResponse.ok) {
          throw new Error(`Failed to download CSV: ${csvResponse.status}`)
        }

        const csvText = await csvResponse.text()
        console.log(`[v0] CSV downloaded, size: ${csvText.length} bytes`)

        // Parse CSV
        const lines = csvText.split("\n").filter((line) => line.trim())
        console.log(`[v0] Total lines: ${lines.length}`)

        if (lines.length < 2) {
          throw new Error("CSV file is empty or has no data rows")
        }

        // Auto-detect separator (|, ;, \t, ,)
        const firstLine = lines[0]
        const separatorCounts = ["|", ";", "\t", ","].map(s => ({
          s, n: (firstLine.match(new RegExp(`\\${s === "\t" ? "t" : s}`, "g")) || []).length
        }))
        const separator = separatorCounts.reduce((best, cur) => cur.n > best.n ? cur : best).s
        console.log(`[v0] Separator detected: "${separator}"`)

        const headers = firstLine.split(separator).map((h) => h.trim().replace(/^["']|["']$/g, ""))
        console.log(`[v0] CSV headers:`, headers)

        const columnMapping = source.column_mapping as Record<string, string>
        console.log(`[v0] Column mapping:`, columnMapping)

        // Create import history record
        const { data: historyRecord, error: historyError } = await supabase
          .from("import_history")
          .insert({
            source_id: source.id,
            status: "in_progress",
            started_at: new Date().toISOString(),
            products_imported: 0,
            products_updated: 0,
            products_failed: 0,
          })
          .select()
          .single()

        if (historyError) {
          console.error("[v0] Error creating history record:", historyError)
          throw historyError
        }

        console.log(`[v0] Created history record: ${historyRecord.id}`)

        let imported = 0
        let updated = 0
        let failed = 0

        // Process products
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]
          if (!line.trim()) continue

          try {
            const values = line.split(separator).map((v) => v.trim().replace(/^["']|["']$/g, ""))
            const row: Record<string, string> = {}

            headers.forEach((header, index) => {
              row[header] = values[index] || ""
            })

            // Map columns
            const sku = row[columnMapping.sku]
            if (!sku) {
              console.log(`[v0] Line ${i}: No SKU found, skipping`)
              failed++
              continue
            }

            const productData: any = {
              sku,
              title: row[columnMapping.title] || "",
              description: row[columnMapping.description] || "",
              price: Number.parseFloat(row[columnMapping.price]) || 0,
              stock: Number.parseInt(row[columnMapping.stock]) || 0,
              source: [source.name],
              updated_at: new Date().toISOString(),
            }

            // Check if product exists (include stock_by_source for merge)
            const { data: existing } = await supabase.from("products").select("id, source, stock_by_source").eq("sku", sku).single()

            // Use source_key (short string) as bucket key — not UUID — so warehouse stock filters work correctly
            const stockKey = source.source_key ?? source.id

            // Merge stock into the source's bucket
            const { stock_by_source, stock: totalStock } = mergeStockBySource(
              existing?.stock_by_source, stockKey, productData.stock
            )
            productData.stock = totalStock
            productData.stock_by_source = stock_by_source

            if (existing) {
              // Update existing product
              const updatedSource = Array.isArray(existing.source)
                ? [...new Set([...existing.source, source.name])]
                : [source.name]

              const { error: updateError } = await supabase
                .from("products")
                .update({
                  ...productData,
                  source: updatedSource,
                })
                .eq("id", existing.id)

              if (updateError) {
                console.error(`[v0] Error updating product ${sku}:`, updateError)
                failed++
              } else {
                updated++
                if (updated % 100 === 0) {
                  console.log(`[v0] Progress: ${updated} updated, ${imported} imported, ${failed} failed`)
                }
              }
            } else {
              // Insert new product
              const { error: insertError } = await supabase.from("products").insert(productData)

              if (insertError) {
                console.error(`[v0] Error inserting product ${sku}:`, insertError)
                failed++
              } else {
                imported++
                if (imported % 100 === 0) {
                  console.log(`[v0] Progress: ${updated} updated, ${imported} imported, ${failed} failed`)
                }
              }
            }
          } catch (error) {
            console.error(`[v0] Error processing line ${i}:`, error)
            failed++
          }
        }

        // Update history record
        await supabase
          .from("import_history")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            products_imported: imported,
            products_updated: updated,
            products_failed: failed,
          })
          .eq("id", historyRecord.id)

        console.log(`[v0] ========================================`)
        console.log(`[v0] Source ${source.name} completed:`)
        console.log(`[v0] Imported: ${imported}`)
        console.log(`[v0] Updated: ${updated}`)
        console.log(`[v0] Failed: ${failed}`)
        console.log(`[v0] ========================================`)

        results.push({
          source: source.name,
          imported,
          updated,
          failed,
          total: imported + updated,
        })
      } catch (error: any) {
        console.error(`[v0] Error processing source ${source.name}:`, error)
        results.push({
          source: source.name,
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error("[v0] Fatal error:", error)
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 },
    )
  }
}
