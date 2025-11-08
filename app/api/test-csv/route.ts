import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const url = "https://elastic-rest.arnoia.com/feeds/getFeeds?customerCode=27401&pass=tale2740&typeFeed=DCSVCL"

    console.log("[v0] Descargando CSV desde:", url)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/csv, application/csv, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
      },
    })

    console.log("[v0] Status:", response.status)
    console.log("[v0] Headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Error response:", errorText)
      return NextResponse.json(
        { error: `Error al descargar CSV: ${response.status} ${response.statusText}`, details: errorText },
        { status: response.status },
      )
    }

    const csvText = await response.text()
    console.log("[v0] CSV length:", csvText.length)
    console.log("[v0] First 500 chars:", csvText.substring(0, 500))

    // Detectar delimitador
    const firstLine = csvText.split("\n")[0]
    const delimiters = [",", ";", "\t", "|"]
    let delimiter = ","
    let maxCount = 0

    for (const d of delimiters) {
      const count = (firstLine.match(new RegExp(`\\${d}`, "g")) || []).length
      if (count > maxCount) {
        maxCount = count
        delimiter = d
      }
    }

    console.log("[v0] Detected delimiter:", delimiter, "count:", maxCount)

    // Parsear primera línea (headers)
    const lines = csvText.split("\n").filter((line) => line.trim())
    const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""))

    console.log("[v0] Headers:", headers)
    console.log("[v0] Total lines:", lines.length)

    return NextResponse.json({
      success: true,
      url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      csvLength: csvText.length,
      totalLines: lines.length,
      delimiter,
      headers,
      firstLine: lines[0],
      preview: lines.slice(0, 3),
    })
  } catch (error: any) {
    console.error("[v0] Error:", error)
    return NextResponse.json(
      { error: "Error al procesar CSV", details: error.message, stack: error.stack },
      { status: 500 },
    )
  }
}
