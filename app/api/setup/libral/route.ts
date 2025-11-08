import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST() {
  try {
    console.log("[v0] Instalando fuente Libral...")
    const supabase = await createClient()

    const { data: existing } = await supabase.from("import_sources").select("id").eq("name", "Libral").maybeSingle()

    if (existing) {
      console.log("[v0] Libral ya existe en la base de datos")
      return NextResponse.json({
        success: true,
        message: "Libral ya está instalado",
        alreadyExists: true,
      })
    }

    const { data, error } = await supabase
      .from("import_sources")
      .insert({
        name: "Libral",
        description: "ERP Libral - Gestión de libros y stock",
        feed_type: "api",
        url_template: "https://libral.core.abazal.com/api/libroes/LibrosLIBRAL?db=GN6LIBRAL",
        auth_type: "jwt",
        credentials: {
          username: process.env.LIBRAL_USERNAME || "SHOPIFY",
          password: process.env.LIBRAL_PASSWORD || "A#7890.ATGHIp",
          database: "GN6LIBRAL",
          login_url: "https://libral.core.abazal.com/api/auth/login?db=GN6LIBRAL",
        },
        column_mapping: {
          sku: "ean",
          title: "titulo",
          description: "sinopsis",
          price: "precioventa",
          stock: "stockdisponibletotal",
          brand: "nombreeditorial",
          image_url: "urlfotografia",
          internal_code: "id",
          custom_fields: {
            isbn: "ean",
            autor: "autores",
            editorial: "nombreeditorial",
            paginas: "numeropaginas",
            idioma: "id_idioma",
            encuadernacion: "nombreencuadernacion",
            peso: "peso",
            ancho: "ancho",
            alto: "alto",
            grosor: "grosor",
          },
        },
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error insertando Libral:", error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 },
      )
    }

    console.log("[v0] Libral instalado correctamente:", data)

    return NextResponse.json({
      success: true,
      message: "Libral instalado correctamente",
      data,
    })
  } catch (error) {
    console.error("[v0] Error en instalación de Libral:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    )
  }
}
