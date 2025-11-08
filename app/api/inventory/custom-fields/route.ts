import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase"

export async function GET() {
  try {
    const supabase = createClient()

    // Obtener todos los productos con custom_fields
    const { data: products, error } = await supabase
      .from("products")
      .select("custom_fields")
      .not("custom_fields", "is", null)

    if (error) {
      console.error("Error fetching products:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Extraer todos los campos personalizados únicos
    const customFieldsSet = new Set<string>()
    const fieldExamples: Record<string, string[]> = {}

    products?.forEach((product) => {
      if (product.custom_fields && typeof product.custom_fields === "object") {
        Object.entries(product.custom_fields).forEach(([key, value]) => {
          customFieldsSet.add(key)

          // Guardar ejemplos de valores para cada campo
          if (!fieldExamples[key]) {
            fieldExamples[key] = []
          }
          if (fieldExamples[key].length < 3 && value) {
            const valueStr = String(value).substring(0, 50)
            if (!fieldExamples[key].includes(valueStr)) {
              fieldExamples[key].push(valueStr)
            }
          }
        })
      }
    })

    const customFields = Array.from(customFieldsSet)
      .sort()
      .map((field) => ({
        name: field,
        examples: fieldExamples[field] || [],
      }))

    return NextResponse.json({
      customFields,
      total: customFields.length,
    })
  } catch (error) {
    console.error("Error in custom-fields endpoint:", error)
    return NextResponse.json({ error: "Error al obtener campos personalizados" }, { status: 500 })
  }
}
