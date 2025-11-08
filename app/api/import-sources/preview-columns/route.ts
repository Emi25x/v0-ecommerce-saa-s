import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url_template, credentials, feed_type } = body

    console.log("[v0] Preview Columns - URL template:", url_template)
    console.log("[v0] Preview Columns - Credentials:", {
      username: credentials?.username,
      hasPassword: !!credentials?.password,
    })
    console.log("[v0] Preview Columns - Feed type:", feed_type)

    let finalUrl: string

    try {
      const parsedUrl = new URL(url_template)

      // Si la URL ya tiene parámetros (customerCode, pass, typeFeed), usarla tal cual
      const hasCustomerCode = parsedUrl.searchParams.has("customerCode")
      const hasPass = parsedUrl.searchParams.has("pass")
      const hasTypeFeed = parsedUrl.searchParams.has("typeFeed")

      if (hasCustomerCode || hasPass || hasTypeFeed) {
        console.log("[v0] Preview Columns - URL ya tiene parámetros, usando tal cual")
        finalUrl = url_template
      } else {
        // Si no tiene parámetros, construir la URL con los datos del formulario
        console.log("[v0] Preview Columns - Construyendo URL con parámetros del formulario")
        if (credentials?.username) {
          parsedUrl.searchParams.set("customerCode", credentials.username)
        }
        if (credentials?.password) {
          parsedUrl.searchParams.set("pass", credentials.password)
        }
        if (feed_type) {
          parsedUrl.searchParams.set("typeFeed", feed_type)
        }
        finalUrl = parsedUrl.toString()
      }
    } catch (error) {
      throw new Error("URL inválida. Verifica el formato de la URL.")
    }

    console.log("[v0] Preview Columns - Final URL:", finalUrl.replace(/pass=[^&]+/, "pass=***"))

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(finalUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/csv, text/plain, application/csv, */*",
      },
    })
    clearTimeout(timeoutId)

    console.log("[v0] Preview Columns - Response status:", response.status)
    console.log("[v0] Preview Columns - Response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      throw new Error(`Error al descargar CSV: ${response.status} ${response.statusText}`)
    }

    const csvText = await response.text()
    console.log("[v0] Preview Columns - CSV length:", csvText.length)
    console.log("[v0] Preview Columns - First 500 chars:", csvText.substring(0, 500))

    if (!csvText || csvText.trim().length === 0) {
      throw new Error("El CSV descargado está vacío")
    }

    const cleanedCsv = csvText.replace(/^\uFEFF/, "").trim()

    if (cleanedCsv.length === 0) {
      throw new Error("El CSV no contiene datos después de limpiar")
    }

    const lines = cleanedCsv.split("\n").filter((line) => line.trim().length > 0)

    if (lines.length === 0) {
      throw new Error("El CSV no contiene líneas válidas")
    }

    const firstLine = lines[0]
    console.log("[v0] Preview Columns - First line:", firstLine)

    const possibleDelimiters = [",", ";", "\t", "|"]
    let delimiter = ","
    let maxColumns = 0

    for (const delim of possibleDelimiters) {
      const columns = firstLine.split(delim).length
      console.log(`[v0] Preview Columns - Delimiter '${delim === "\t" ? "\\t" : delim}': ${columns} columns`)
      if (columns > maxColumns) {
        maxColumns = columns
        delimiter = delim
      }
    }

    console.log("[v0] Preview Columns - Detected delimiter:", delimiter === "\t" ? "\\t" : delimiter)
    console.log("[v0] Preview Columns - Number of columns:", maxColumns)

    if (maxColumns <= 1) {
      throw new Error(`No se pudo detectar el delimitador del CSV. Primera línea: ${firstLine.substring(0, 100)}...`)
    }

    const headers = firstLine
      .split(delimiter)
      .map(
        (h) =>
          h
            .trim()
            .replace(/^["']|["']$/g, "") // Remover comillas simples y dobles
            .replace(/^\uFEFF/, ""), // Remover BOM si existe
      )
      .filter((h) => h.length > 0)

    console.log("[v0] Preview Columns - Headers:", headers)

    if (headers.length === 0) {
      throw new Error("No se encontraron encabezados válidos en el CSV")
    }

    return NextResponse.json({
      headers,
      delimiter,
      rowCount: lines.length - 1,
    })
  } catch (error) {
    console.error("[v0] Preview Columns - Error:", error)

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json(
          { error: "Timeout al descargar el CSV. Verifica la URL y las credenciales." },
          { status: 408 },
        )
      }

      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: "Error desconocido al cargar columnas del CSV" }, { status: 500 })
  }
}
