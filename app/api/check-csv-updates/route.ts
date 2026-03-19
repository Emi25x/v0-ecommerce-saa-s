import { createClient } from "@/lib/db/server"
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
        // Intentar HEAD primero; si devuelve 405 → fallback a GET con Range bytes=0-2048
        let response = await fetch(source.url_template, { method: "HEAD" })
        let fallbackUsed = false

        if (response.status === 405 || response.status === 403 || response.status === 501) {
          console.log(`[v0] ${source.name} - HEAD devolvió ${response.status}, fallback a GET Range`)
          response = await fetch(source.url_template, {
            method: "GET",
            headers: { Range: "bytes=0-2048" },
          })
          fallbackUsed = true
        }

        const lastModified = response.headers.get("last-modified")
        const contentLength = response.headers.get("content-length")
        const etag = response.headers.get("etag")

        console.log(
          `[v0] ${source.name} - status:${response.status} fallback:${fallbackUsed} Last-Modified:${lastModified} Content-Length:${contentLength}`,
        )

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
          fallbackUsed,
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
