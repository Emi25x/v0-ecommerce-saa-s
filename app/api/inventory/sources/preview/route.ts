import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"
import { createClient } from "@/lib/db/server"

export const maxDuration = 30

/**
 * GET /api/inventory/sources/preview?source_id=xxx
 * o
 * GET /api/inventory/sources/preview?url=xxx
 *
 * Descarga los primeros KB del CSV y detecta headers automáticamente
 */
export async function GET(request: NextRequest) {
  const authCheck = await protectAPI()
  if (authCheck.error) return authCheck.response

  const { searchParams } = new URL(request.url)
  const sourceId = searchParams.get("source_id")
  const directUrl = searchParams.get("url")

  if (!sourceId && !directUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Se requiere source_id o url",
      },
      { status: 400 },
    )
  }

  try {
    const supabase = await createClient()
    let urlToFetch = directUrl
    let authType = "none"
    let credentials: any = {}

    // Si se proporciona source_id, obtener configuración
    if (sourceId) {
      const { data: source, error } = await supabase
        .from("import_sources")
        .select("url_template, auth_type, credentials")
        .eq("id", sourceId)
        .single()

      if (error || !source) {
        return NextResponse.json(
          {
            ok: false,
            error: "Fuente no encontrada",
          },
          { status: 404 },
        )
      }

      urlToFetch = source.url_template
      authType = source.auth_type
      credentials = source.credentials || {}
    }

    if (!urlToFetch) {
      return NextResponse.json(
        {
          ok: false,
          error: "URL no especificada",
        },
        { status: 400 },
      )
    }

    // Construir headers de autenticación
    const headers: HeadersInit = {
      "User-Agent": "Ecommerce-Manager/1.0",
    }

    if (authType === "basic_auth" && credentials?.username && credentials?.password) {
      const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    } else if (authType === "bearer_token" && credentials?.token) {
      headers["Authorization"] = `Bearer ${credentials.token}`
    } else if (authType === "query_params" && credentials?.type === "query_params" && credentials?.params) {
      // Agregar query params a la URL desde el nuevo formato
      const url = new URL(urlToFetch)
      Object.keys(credentials.params).forEach((key) => {
        url.searchParams.set(key, credentials.params[key])
      })
      urlToFetch = url.toString()
    } else if (authType === "none" || !authType) {
      // No hacer nada, usar URL directamente sin autenticación
    }

    console.log(`[v0] Fetching CSV preview from: ${urlToFetch}`)

    // Intentar primero con Range header para limitar descarga
    let response = await fetch(urlToFetch, {
      method: "GET",
      headers: {
        ...headers,
        Accept: "text/csv, text/plain, application/csv, */*",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Range: "bytes=0-102400", // Primeros 100KB
      },
      signal: AbortSignal.timeout(15000), // Timeout 15s
    })

    // Si falla con Range (403/416), reintentar sin Range header
    if (!response.ok && (response.status === 403 || response.status === 416)) {
      console.log(`[v0] Range request failed (${response.status}), retrying without Range header`)
      response = await fetch(urlToFetch, {
        method: "GET",
        headers: {
          ...headers,
          Accept: "text/csv, text/plain, application/csv, */*",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(20000), // Timeout más largo sin Range
      })
    }

    if (!response.ok) {
      console.error(`[v0] Fetch failed with status ${response.status}`)
      return NextResponse.json(
        {
          ok: false,
          error: `Error al descargar CSV: ${response.statusText} (${response.status})`,
        },
        { status: response.status },
      )
    }

    // Leer el contenido pero limitar a los primeros 200KB para evitar timeouts
    let csvText = ""
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let bytesRead = 0
    const maxBytes = 200 * 1024 // 200KB máximo

    if (reader) {
      while (bytesRead < maxBytes) {
        const { done, value } = await reader.read()
        if (done) break

        csvText += decoder.decode(value, { stream: true })
        bytesRead += value.length

        // Si ya tenemos suficientes líneas, podemos parar
        const lineCount = (csvText.match(/\n/g) || []).length
        if (lineCount >= 100) break
      }
      reader.cancel() // Cancelar el stream
    } else {
      csvText = await response.text()
    }

    const lines = csvText
      .split("\n")
      .filter((l) => l.trim())
      .slice(0, 50) // Primeras 50 líneas

    if (lines.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "CSV vacío o formato inválido",
        },
        { status: 400 },
      )
    }

    // Detectar delimitador: contar ocurrencias de ,;|\t en primera línea
    const firstLine = lines[0]
    const commaCount = (firstLine.match(/,/g) || []).length
    const semicolonCount = (firstLine.match(/;/g) || []).length
    const pipeCount = (firstLine.match(/\|/g) || []).length
    const tabCount = (firstLine.match(/\t/g) || []).length

    let detectedDelimiter = ","
    const counts = { ",": commaCount, ";": semicolonCount, "|": pipeCount, "\t": tabCount }
    const maxCount = Math.max(commaCount, semicolonCount, pipeCount, tabCount)

    if (maxCount > 0) {
      detectedDelimiter = Object.keys(counts).find((k) => counts[k as keyof typeof counts] === maxCount) || ","
    }

    // Parsear header (primera línea)
    const headers_csv = firstLine.split(detectedDelimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""))

    // Parsear sample rows (2-6 líneas)
    const sampleRows = lines.slice(1, 6).map((line) => {
      const values = line.split(detectedDelimiter).map((v) => v.trim().replace(/^["']|["']$/g, ""))
      const row: any = {}
      headers_csv.forEach((h, i) => {
        row[h] = values[i] || ""
      })
      return row
    })

    return NextResponse.json({
      ok: true,
      detected_delimiter: detectedDelimiter,
      headers: headers_csv,
      sample_rows: sampleRows,
      total_lines_preview: lines.length,
    })
  } catch (error: any) {
    console.error("[v0] Error previewing CSV:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Error al procesar CSV",
      },
      { status: 500 },
    )
  }
}
