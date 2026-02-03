import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Actualiza el seller_sku de las publicaciones existentes en ML con el EAN del producto
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id } = await request.json()

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Refrescar token si es necesario
    let accessToken = account.access_token
    if (new Date(account.token_expires_at) <= new Date()) {
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || ""}/api/mercadolibre/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id })
      })
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        accessToken = refreshData.access_token
      } else {
        return NextResponse.json({ error: "Error al refrescar token" }, { status: 401 })
      }
    }

    // Obtener todas las publicaciones de esta cuenta con su producto relacionado
    const { data: publications, error: pubError } = await supabase
      .from("ml_publications")
      .select(`
        id,
        ml_item_id,
        product_id,
        products!inner (
          id,
          ean,
          sku,
          title
        )
      `)
      .eq("account_id", account_id)

    if (pubError) {
      console.error("[v0] Error obteniendo publicaciones:", pubError)
      return NextResponse.json({ error: "Error al obtener publicaciones" }, { status: 500 })
    }

    if (!publications || publications.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay publicaciones para actualizar",
        updated: 0 
      })
    }

    let updated = 0
    let errors = 0
    let skipped = 0
    const results: Array<{ ml_item_id: string; ean?: string; status: string; error?: string }> = []

    for (const pub of publications) {
      const product = pub.products as any
      const ean = product?.ean || product?.sku

      if (!ean) {
        skipped++
        results.push({ 
          ml_item_id: pub.ml_item_id, 
          status: "skipped", 
          error: "Producto sin EAN/SKU" 
        })
        continue
      }

      try {
        // Actualizar seller_sku en ML
        const updateResponse = await fetch(`https://api.mercadolibre.com/items/${pub.ml_item_id}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            seller_sku: ean
          })
        })

        if (updateResponse.ok) {
          updated++
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            ean,
            status: "updated" 
          })
        } else {
          const errorData = await updateResponse.json()
          errors++
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            ean,
            status: "error", 
            error: errorData.message || JSON.stringify(errorData)
          })
        }

        // Delay para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err) {
        errors++
        results.push({ 
          ml_item_id: pub.ml_item_id, 
          ean,
          status: "error", 
          error: "Error de conexión" 
        })
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      errors,
      skipped,
      total: publications.length,
      message: `Actualizado seller_sku: ${updated} ok, ${errors} errores, ${skipped} sin EAN`,
      results
    })

  } catch (error) {
    console.error("[v0] Error en fix-seller-sku:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
