import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

export async function GET(request: NextRequest) {
  try {
    const sourceId = request.nextUrl.searchParams.get("sourceId")
    
    const supabase = await createClient()
    
    // Si no hay sourceId, buscar Arnoia
    let url = ""
    if (sourceId) {
      const { data: source } = await supabase
        .from("import_sources")
        .select("url_template")
        .eq("id", sourceId)
        .single()
      url = source?.url_template || ""
    } else {
      const { data: source } = await supabase
        .from("import_sources")
        .select("url_template")
        .eq("name", "Arnoia")
        .single()
      url = source?.url_template || ""
    }

    if (!url) {
      return NextResponse.json({ error: "No se encontró la URL" }, { status: 404 })
    }

    // Descargar solo los primeros bytes del archivo
    const response = await fetch(url)
    const text = await response.text()
    
    // Tomar solo las primeras 10 líneas
    const lines = text.split("\n").slice(0, 10)
    const preview = lines.join("\n")
    
    // Detectar delimitador
    const firstLine = lines[0] || ""
    const semicolonCount = (firstLine.match(/;/g) || []).length
    const commaCount = (firstLine.match(/,/g) || []).length
    const tabCount = (firstLine.match(/\t/g) || []).length
    const pipeCount = (firstLine.match(/\|/g) || []).length
    
    const detectedDelimiter = 
      semicolonCount > commaCount && semicolonCount > tabCount && semicolonCount > pipeCount ? ";" :
      commaCount > tabCount && commaCount > pipeCount ? "," :
      tabCount > pipeCount ? "\\t" : "|"
    
    // Parsear con el delimitador detectado
    const parsed = Papa.parse(preview, {
      header: true,
      delimiter: detectedDelimiter === "\\t" ? "\t" : detectedDelimiter,
      skipEmptyLines: true,
    })
    
    return NextResponse.json({
      rawPreview: preview,
      firstLine: firstLine,
      detectedDelimiter,
      delimiterCounts: { semicolon: semicolonCount, comma: commaCount, tab: tabCount, pipe: pipeCount },
      headers: parsed.meta.fields,
      firstRows: parsed.data.slice(0, 3),
      totalChars: text.length,
    })
  } catch (error) {
    console.error("[v0] Error en debug-csv:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
