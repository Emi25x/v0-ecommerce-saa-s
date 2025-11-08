import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    console.log("[v0] Checking CSV file update times...")

    const supabase = await createClient()

    // Get all active sources
    const { data: sources, error } = await supabase.from("import_sources").select("*").eq("is_active", true)

    if (error) {
      console.error("[v0] Error fetching sources:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[v0] Found ${sources?.length || 0} active sources`)

    const results = []

    for (const source of sources || []) {
      console.log(`[v0] Checking source: ${source.name}`)
      console.log(`[v0] URL: ${source.url_template}`)

      try {
        // Make a HEAD request to get headers without downloading the file
        const response = await fetch(source.url_template, {
          method: "HEAD",
        })

        const lastModified = response.headers.get("last-modified")
        const contentLength = response.headers.get("content-length")
        const etag = response.headers.get("etag")

        console.log(`[v0] ${source.name} - Last-Modified: ${lastModified}`)
        console.log(`[v0] ${source.name} - Content-Length: ${contentLength}`)
        console.log(`[v0] ${source.name} - ETag: ${etag}`)

        results.push({
          name: source.name,
          url: source.url_template,
          lastModified: lastModified ? new Date(lastModified).toISOString() : null,
          lastModifiedLocal: lastModified
            ? new Date(lastModified).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
            : null,
          contentLength: contentLength ? Number.parseInt(contentLength) : null,
          etag,
          status: response.status,
        })
      } catch (error) {
        console.error(`[v0] Error checking ${source.name}:`, error)
        results.push({
          name: source.name,
          url: source.url_template,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      sources: results,
      checkedAt: new Date().toISOString(),
      checkedAtLocal: new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }),
    })
  } catch (error) {
    console.error("[v0] Error in check-csv-updates:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
