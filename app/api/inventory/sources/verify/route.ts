import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

console.log("[v0] ========================================")
console.log("[v0] Source verification endpoint loaded")
console.log("[v0] ========================================")

export async function GET(request: Request) {
  console.log("[v0] GET /api/inventory/sources/verify - STARTING")

  try {
    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get("sourceId")
    const sourceName = searchParams.get("name")

    console.log("[v0] Creating Supabase client...")
    const supabase = await createClient()
    console.log("[v0] Supabase client created")

    let query = supabase.from("import_sources").select("*")

    if (sourceId) {
      query = query.eq("id", sourceId)
    } else if (sourceName) {
      query = query.ilike("name", `%${sourceName}%`)
    } else {
      console.log("[v0] No sourceId or name provided, fetching all sources")
    }

    const { data: sources, error: sourceError } = await query

    if (sourceError) {
      console.error("[v0] Error fetching sources:", sourceError)
      return NextResponse.json({ error: sourceError.message }, { status: 500 })
    }

    if (!sources || sources.length === 0) {
      return NextResponse.json({ error: "No sources found" }, { status: 404 })
    }

    console.log("[v0] Found", sources.length, "source(s)")

    const results = []

    for (const source of sources) {
      console.log("[v0] Verifying source:", source.name)
      console.log("[v0] URL:", source.url_template)
      console.log("[v0] Column mapping:", JSON.stringify(source.column_mapping, null, 2))

      try {
        // Download CSV to verify structure
        console.log("[v0] Downloading CSV from:", source.url_template)
        const csvResponse = await fetch(source.url_template)

        if (!csvResponse.ok) {
          console.error("[v0] Failed to download CSV:", csvResponse.status, csvResponse.statusText)
          results.push({
            source: {
              id: source.id,
              name: source.name,
              url: source.url_template,
            },
            error: `Failed to download CSV: ${csvResponse.status} ${csvResponse.statusText}`,
          })
          continue
        }

        const csvText = await csvResponse.text()
        console.log("[v0] CSV downloaded, size:", csvText.length, "bytes")

        // Parse CSV header
        const lines = csvText.split("\n")
        const header = lines[0].split(";")
        console.log("[v0] CSV header columns:", header)
        console.log("[v0] Total rows:", lines.length - 1)

        // Get first 3 data rows as sample
        const sampleRows = lines.slice(1, 4).map((line) => {
          const values = line.split(";")
          const row: Record<string, string> = {}
          header.forEach((col, i) => {
            row[col] = values[i] || ""
          })
          return row
        })

        console.log("[v0] Sample rows:", JSON.stringify(sampleRows, null, 2))

        // Verify column mapping
        const mappingIssues: string[] = []
        if (source.column_mapping) {
          Object.entries(source.column_mapping).forEach(([field, csvColumn]) => {
            if (!header.includes(csvColumn as string)) {
              mappingIssues.push(`Field "${field}" is mapped to "${csvColumn}" but this column doesn't exist in CSV`)
            }
          })
        }

        console.log("[v0] Mapping issues:", mappingIssues.length > 0 ? mappingIssues : "None")

        results.push({
          source: {
            id: source.id,
            name: source.name,
            url: source.url_template,
            column_mapping: source.column_mapping,
            is_active: source.is_active,
          },
          csv: {
            totalRows: lines.length - 1,
            header,
            sampleRows,
          },
          validation: {
            csvAccessible: true,
            mappingIssues,
          },
        })
      } catch (error) {
        console.error("[v0] Error verifying source:", source.name, error)
        results.push({
          source: {
            id: source.id,
            name: source.name,
            url: source.url_template,
          },
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      count: results.length,
      results,
    })
  } catch (error) {
    console.error("[v0] Error in source verification:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
