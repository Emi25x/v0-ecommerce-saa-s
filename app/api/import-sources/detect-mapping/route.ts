import { type NextRequest, NextResponse } from "next/server"
import { getMercadoLibreProducts } from "@/lib/mercadolibre"

export async function POST(request: NextRequest) {
  try {
    const { url, username, password } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL es requerida" }, { status: 400 })
    }

    let fullUrl = url
    const fetchHeaders: HeadersInit = {
      Accept: "text/csv, text/plain, application/csv, */*",
    }

    if (username && password) {
      if (url.includes("(USUARIO)") || url.includes("(CLAVE)")) {
        fullUrl = url.replace("(USUARIO)", username).replace("(CLAVE)", password)
        console.log("[v0] Detect Mapping - Using URL placeholders")
      } else {
        const credentials = btoa(`${username}:${password}`)
        fetchHeaders.Authorization = `Basic ${credentials}`
        console.log("[v0] Detect Mapping - Using HTTP Basic Auth")
      }
      console.log("[v0] Detect Mapping - Downloading CSV from:", fullUrl.replace(password, "***"))
    } else {
      if (url.includes("(USUARIO)") || url.includes("(CLAVE)")) {
        return NextResponse.json(
          { error: "La URL contiene placeholders (USUARIO) o (CLAVE) pero no se proporcionaron credenciales" },
          { status: 400 },
        )
      }
      console.log("[v0] Detect Mapping - Downloading CSV from:", fullUrl)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const csvResponse = await fetch(fullUrl, {
      signal: controller.signal,
      headers: fetchHeaders,
    })
    clearTimeout(timeoutId)

    console.log("[v0] Detect Mapping - Response status:", csvResponse.status)

    if (!csvResponse.ok) {
      if (csvResponse.status === 401 || csvResponse.status === 403) {
        return NextResponse.json(
          { error: "Error de autenticación. Verifica que las credenciales sean correctas." },
          { status: csvResponse.status },
        )
      }
      throw new Error(`Failed to download CSV: ${csvResponse.status} ${csvResponse.statusText}`)
    }

    const csvText = await csvResponse.text()
    console.log("[v0] Detect Mapping - CSV length:", csvText.length)

    if (!csvText || csvText.length === 0) {
      throw new Error("El CSV descargado está vacío")
    }

    const lines = csvText.trim().split("\n")

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV vacío o sin datos" }, { status: 400 })
    }

    const firstLine = lines[0]
    const possibleDelimiters = [",", ";", "\t", "|"]
    let delimiter = ","
    let maxColumns = 0

    for (const delim of possibleDelimiters) {
      const columns = firstLine.split(delim).length
      if (columns > maxColumns) {
        maxColumns = columns
        delimiter = delim
      }
    }

    console.log("[v0] Detect Mapping - Detected delimiter:", delimiter === "\t" ? "\\t" : delimiter)

    const headers = firstLine
      .split(delimiter)
      .map((h) =>
        h
          .trim()
          .replace(/^"|"$/g, "")
          .replace(/^\uFEFF/, ""),
      )
      .filter((h) => h.length > 0)

    console.log("[v0] Detect Mapping - CSV Headers:", headers)

    const firstDataRow = lines[1].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""))

    console.log("[v0] Detect Mapping - First data row:", firstDataRow)

    const csvData = lines.slice(1).map((line) => {
      const values = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""))
      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ""
      })
      return row
    })

    const detectedMapping: Record<string, string> = {}

    // Mapeo basado en keywords comunes
    const fieldKeywords: Record<string, string[]> = {
      sku: ["sku", "codigo", "code", "ref", "referencia", "item"],
      title: ["titulo", "title", "nombre", "name", "producto", "product", "descripcion"],
      price: ["precio", "price", "valor", "value", "cost", "costo"],
      stock: ["stock", "cantidad", "quantity", "disponible", "available", "inventario"],
      image_url: ["imagen", "image", "foto", "photo", "picture", "url_imagen"],
      description: ["descripcion", "description", "detalle", "detail"],
    }

    for (const header of headers) {
      const headerLower = header.toLowerCase()

      for (const [field, keywords] of Object.entries(fieldKeywords)) {
        if (keywords.some((keyword) => headerLower.includes(keyword))) {
          detectedMapping[header] = field
          console.log(`[v0] Detected ${field} column: ${header}`)
          break
        }
      }
    }

    const accessToken = request.cookies.get("ml_access_token")?.value
    const userId = request.cookies.get("ml_user_id")?.value
    let mlProductsCount = 0
    let descriptionTemplate = ""

    if (accessToken && userId) {
      try {
        console.log("[v0] ML authentication available, enhancing detection...")
        const { products: mlProducts } = await getMercadoLibreProducts(accessToken, userId, 50, 0)
        mlProductsCount = mlProducts.length

        console.log("[v0] Detect Mapping - ML Products for comparison:", mlProducts.length)

        // Mejorar la detección comparando con productos de ML
        for (const header of headers) {
          if (detectedMapping[header]) continue // Ya detectado

          const csvValues = csvData.map((row) => row[header]).filter(Boolean)

          // Intentar detectar SKU por coincidencias
          if (!Object.values(detectedMapping).includes("sku")) {
            const skuMatches = mlProducts.filter((p) => p.SELLER_SKU && csvValues.includes(p.SELLER_SKU)).length
            if (skuMatches > 0) {
              detectedMapping[header] = "sku"
              console.log(`[v0] Detected SKU column via ML: ${header} (${skuMatches} matches)`)
              continue
            }
          }

          // Intentar detectar título por coincidencias
          if (!Object.values(detectedMapping).includes("title")) {
            const titleMatches = mlProducts.filter((p) =>
              csvValues.some((v) => p.title.includes(v) || v.includes(p.title)),
            ).length
            if (titleMatches > 0) {
              detectedMapping[header] = "title"
              console.log(`[v0] Detected title column via ML: ${header} (${titleMatches} matches)`)
              continue
            }
          }

          // Intentar detectar precio por coincidencias
          if (!Object.values(detectedMapping).includes("price")) {
            const priceMatches = mlProducts.filter((p) =>
              csvValues.some((v) => Math.abs(Number.parseFloat(v) - p.price) < 1),
            ).length
            if (priceMatches > 0) {
              detectedMapping[header] = "price"
              console.log(`[v0] Detected price column via ML: ${header} (${priceMatches} matches)`)
              continue
            }
          }

          // Intentar detectar stock por coincidencias
          if (!Object.values(detectedMapping).includes("stock")) {
            const stockMatches = mlProducts.filter((p) =>
              csvValues.some((v) => Number.parseInt(v) === p.available_quantity),
            ).length
            if (stockMatches > 0) {
              detectedMapping[header] = "stock"
              console.log(`[v0] Detected stock column via ML: ${header} (${stockMatches} matches)`)
              continue
            }
          }
        }

        // Intentar detectar template de descripción
        const sampleProduct = mlProducts[0]
        if (sampleProduct) {
          const descResponse = await fetch(`https://api.mercadolibre.com/items/${sampleProduct.id}/description`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (descResponse.ok) {
            const descData = await descResponse.json()
            const description = descData.plain_text || descData.text || ""

            console.log("[v0] Sample description:", description)

            let template = description
            const csvRow = csvData[0]

            for (const [header, value] of Object.entries(csvRow)) {
              if (value && description.includes(value)) {
                template = template.replace(new RegExp(value, "g"), `{${header}}`)
              }
            }

            descriptionTemplate = template
            console.log("[v0] Detected description template:", descriptionTemplate)
          }
        }
      } catch (mlError) {
        console.log("[v0] ML enhancement failed, using basic detection:", mlError)
        // Continuar con la detección básica
      }
    } else {
      console.log("[v0] ML not available, using basic keyword detection")
    }

    return NextResponse.json({
      detectedColumns: headers,
      detectedMapping,
      descriptionTemplate,
      sampleData: csvData.slice(0, 3),
      mlProductsCount,
      delimiter,
    })
  } catch (error) {
    console.error("[v0] Detect Mapping - Error:", error)

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return NextResponse.json(
          { error: "Timeout al descargar el CSV. Verifica la URL y las credenciales." },
          { status: 408 },
        )
      }

      return NextResponse.json({ error: "Error al detectar mapeo", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: "Error desconocido al detectar mapeo" }, { status: 500 })
  }
}
