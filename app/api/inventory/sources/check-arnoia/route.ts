import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET() {
  console.log("[v0] ========================================")
  console.log("[v0] Checking Arnoia source configuration...")

  try {
    const supabase = await createClient()

    // Get Arnoia source configuration
    const { data: source, error: sourceError } = await supabase
      .from("inventory_sources")
      .select("*")
      .ilike("name", "%arnoia%")
      .single()

    if (sourceError) {
      console.log("[v0] Error fetching source:", sourceError)
      return NextResponse.json({ error: "Source not found", details: sourceError }, { status: 404 })
    }

    console.log("[v0] Source found:", source.name)
    console.log("[v0] Source URL:", source.csv_url)
    console.log("[v0] Column mapping:", JSON.stringify(source.column_mapping, null, 2))

    // Download CSV to check structure
    console.log("[v0] Downloading CSV from:", source.csv_url)
    const csvResponse = await fetch(source.csv_url)

    if (!csvResponse.ok) {
      console.log("[v0] Failed to download CSV:", csvResponse.status, csvResponse.statusText)
      return NextResponse.json(
        {
          error: "Failed to download CSV",
          status: csvResponse.status,
          statusText: csvResponse.statusText,
        },
        { status: 500 },
      )
    }

    const csvText = await csvResponse.text()
    const lines = csvText.split("\n").filter((line) => line.trim())
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""))
    const firstRow = lines[1]?.split(",").map((v) => v.trim().replace(/"/g, ""))

    console.log("[v0] CSV Headers:", headers)
    console.log("[v0] First row:", firstRow)
    console.log("[v0] Total rows:", lines.length - 1)

    // Verify column mapping
    const mapping = source.column_mapping as Record<string, string>
    const mappingIssues: string[] = []

    for (const [field, csvColumn] of Object.entries(mapping)) {
      if (!headers.includes(csvColumn)) {
        mappingIssues.push(`Field "${field}" maps to "${csvColumn}" but CSV doesn't have this column`)
      }
    }

    const result = {
      source: {
        id: source.id,
        name: source.name,
        type: source.type,
        csv_url: source.csv_url,
        column_mapping: source.column_mapping,
        duplicate_handling: source.duplicate_handling,
        is_active: source.is_active,
      },
      csv: {
        totalRows: lines.length - 1,
        headers,
        firstRowExample: firstRow ? Object.fromEntries(headers.map((h, i) => [h, firstRow[i]])) : null,
      },
      validation: {
        isValid: mappingIssues.length === 0,
        issues: mappingIssues,
      },
    }

    console.log("[v0] Validation result:", result.validation)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error checking source:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
