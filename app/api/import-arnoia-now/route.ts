import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // 1 minuto

export async function GET() {
  console.log("[v0] ==========================================")
  console.log("[v0] IMPORT ARNOIA NOW - ENDPOINT CALLED")
  console.log("[v0] ==========================================")

  try {
    const supabase = await createClient()

    // Buscar la fuente Arnoia
    const { data: sources } = await supabase.from("import_sources").select("*").ilike("name", "%arnoia%").limit(1)

    if (!sources || sources.length === 0) {
      return NextResponse.json({ error: "Fuente Arnoia no encontrada" }, { status: 404 })
    }

    const source = sources[0]
    console.log("[v0] Fuente encontrada:", source.name)
    console.log("[v0] URL:", source.url_template)

    // Descargar CSV
    console.log("[v0] Descargando CSV...")
    const response = await fetch(source.url_template)
    if (!response.ok) {
      throw new Error(`Error descargando CSV: ${response.statusText}`)
    }

    const csvText = await response.text()
    const lines = csvText.split("\n").filter((l) => l.trim())
    console.log("[v0] CSV descargado:", lines.length, "líneas")

    // Detectar separador
    const firstLine = lines[0]
    const commas = (firstLine.match(/,/g) || []).length
    const semicolons = (firstLine.match(/;/g) || []).length
    const pipes = (firstLine.match(/\|/g) || []).length
    const separator = pipes > Math.max(commas, semicolons) ? "|" : semicolons > commas ? ";" : ","

    console.log("[v0] Separador detectado:", separator)

    // Parsear headers
    const headers = firstLine.split(separator).map((h) => h.trim().replace(/^["']|["']$/g, ""))
    console.log("[v0] Headers:", headers)

    // Crear historial
    const { data: history } = await supabase
      .from("import_history")
      .insert({
        source_id: source.id,
        status: "running",
        started_at: new Date().toISOString(),
        products_imported: 0,
        products_updated: 0,
        products_failed: 0,
      })
      .select()
      .single()

    let imported = 0
    let updated = 0
    let failed = 0

    // Procesar productos
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(separator).map((v) => v.trim().replace(/^["']|["']$/g, ""))

        const product: any = {}
        const customFields: any = {}

        // Mapear columnas
        Object.entries(source.column_mapping).forEach(([dbField, csvField]) => {
          const index = headers.indexOf(csvField as string)
          if (index !== -1 && values[index]) {
            const value = values[index]
            if (dbField === "price" || dbField === "stock") {
              const num = Number.parseFloat(value.replace(/,/g, "."))
              if (!isNaN(num)) {
                product[dbField] = num
              }
            } else if (
              [
                "sku",
                "title",
                "description",
                "internal_code",
                "condition",
                "brand",
                "category",
                "image_url",
                "source",
              ].includes(dbField)
            ) {
              product[dbField] = value
            } else {
              customFields[dbField] = value
            }
          }
        })

        if (!product.sku) {
          failed++
          continue
        }

        // Verificar si existe
        const { data: existing } = await supabase.from("products").select("id").eq("sku", product.sku).maybeSingle()

        if (Object.keys(customFields).length > 0) {
          product.custom_fields = customFields
        }

        if (existing) {
          await supabase.from("products").update(product).eq("id", existing.id)
          updated++
        } else {
          await supabase.from("products").insert(product)
          imported++
        }

        if (i % 100 === 0) {
          console.log(`[v0] Progreso: ${i}/${lines.length - 1}`)
        }
      } catch (error: any) {
        console.error("[v0] Error en línea", i, ":", error.message)
        failed++
      }
    }

    // Actualizar historial
    await supabase
      .from("import_history")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        products_imported: imported,
        products_updated: updated,
        products_failed: failed,
      })
      .eq("id", history?.id)

    console.log("[v0] ==========================================")
    console.log("[v0] IMPORTACIÓN COMPLETADA")
    console.log("[v0] Importados:", imported)
    console.log("[v0] Actualizados:", updated)
    console.log("[v0] Fallidos:", failed)
    console.log("[v0] ==========================================")

    return NextResponse.json({
      success: true,
      imported,
      updated,
      failed,
      total: lines.length - 1,
    })
  } catch (error: any) {
    console.error("[v0] ERROR:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
