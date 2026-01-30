import { type NextRequest, NextResponse } from "next/server"
import Papa from "papaparse"

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")
  
  if (!url) {
    return NextResponse.json({ error: "URL requerida" }, { status: 400 })
  }

  try {
    console.log("[v0] Descargando archivo CSV para análisis...")
    const response = await fetch(url)
    
    if (!response.ok) {
      return NextResponse.json({ error: "Error descargando archivo" }, { status: 500 })
    }

    const csvText = await response.text()
    console.log("[v0] Archivo descargado, tamaño:", csvText.length, "caracteres")

    // Parsear CSV
    const { data } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    })

    console.log("[v0] Total filas:", data.length)

    // Analizar columnas disponibles
    const firstRow = data[0] as Record<string, string>
    const columns = Object.keys(firstRow || {})

    // Buscar columna EAN (puede llamarse EAN, ean, ISBN, isbn, etc)
    const eanColumn = columns.find(c => 
      c.toLowerCase() === "ean" || 
      c.toLowerCase() === "isbn" || 
      c.toLowerCase().includes("ean") ||
      c.toLowerCase().includes("isbn")
    )

    console.log("[v0] Columnas encontradas:", columns.slice(0, 10))
    console.log("[v0] Columna EAN detectada:", eanColumn)

    let conEan = 0
    let sinEan = 0

    for (const row of data as Record<string, string>[]) {
      const eanValue = eanColumn ? row[eanColumn]?.trim() : null
      if (eanValue && eanValue.length > 0) {
        conEan++
      } else {
        sinEan++
      }
    }

    return NextResponse.json({
      total: data.length,
      columnas: columns,
      columnaEan: eanColumn,
      conEan,
      sinEan,
      porcentajeConEan: ((conEan / data.length) * 100).toFixed(2),
      ejemplos: (data as Record<string, string>[]).slice(0, 3).map(row => ({
        ean: eanColumn ? row[eanColumn] : null,
        sku: row["Codigo interno"] || row["SKU"] || row["sku"],
        titulo: row["Titulo"] || row["TITULO"] || row["title"],
      }))
    })

  } catch (error) {
    console.error("[v0] Error analizando CSV:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
