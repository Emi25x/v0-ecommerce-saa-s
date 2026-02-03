import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Republica las publicaciones creadas por este proyecto con el EAN como seller_sku
// 1. Cierra la publicación existente
// 2. Crea una nueva con seller_sku = EAN
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

    // Obtener publicaciones de este proyecto (las que tienen product_id)
    const { data: publications, error: pubError } = await supabase
      .from("ml_publications")
      .select(`
        id,
        ml_item_id,
        product_id,
        status,
        products:product_id (
          id,
          ean,
          sku,
          title,
          stock,
          price,
          author,
          publisher,
          image_url
        )
      `)
      .eq("account_id", account_id)
      .not("product_id", "is", null)

    if (pubError) {
      return NextResponse.json({ error: "Error al obtener publicaciones" }, { status: 500 })
    }

    if (!publications || publications.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay publicaciones para republicar",
        republished: 0 
      })
    }

    console.log(`[v0] Republicando ${publications.length} publicaciones con seller_sku`)

    let republished = 0
    let errors = 0
    const results: Array<{ ml_item_id: string; status: string; new_item_id?: string; error?: string }> = []

    for (const pub of publications) {
      const product = pub.products as any
      if (!product || !product.ean) {
        results.push({ 
          ml_item_id: pub.ml_item_id, 
          status: "skipped", 
          error: "Sin EAN" 
        })
        continue
      }

      try {
        // 1. Obtener datos de la publicación actual
        const itemResponse = await fetch(
          `https://api.mercadolibre.com/items/${pub.ml_item_id}`,
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        )

        if (!itemResponse.ok) {
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            status: "error", 
            error: "No se pudo obtener item" 
          })
          errors++
          continue
        }

        const currentItem = await itemResponse.json()

        // 2. Primero cerrar la publicación (requerido antes de eliminar)
        const closeResponse = await fetch(
          `https://api.mercadolibre.com/items/${pub.ml_item_id}`,
          {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "closed" })
          }
        )

        if (!closeResponse.ok) {
          const closeError = await closeResponse.json()
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            status: "error", 
            error: `Error al cerrar: ${closeError.message}` 
          })
          errors++
          continue
        }

        console.log(`[v0] Cerrada publicación ${pub.ml_item_id}`)

        // 3. Ahora eliminar la publicación
        const deleteResponse = await fetch(
          `https://api.mercadolibre.com/items/${pub.ml_item_id}`,
          {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ deleted: true })
          }
        )

        if (!deleteResponse.ok) {
          const deleteError = await deleteResponse.json()
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            status: "error", 
            error: `Error al eliminar: ${deleteError.message}` 
          })
          errors++
          continue
        }

        console.log(`[v0] Eliminada publicación ${pub.ml_item_id}`)

        // 3. Esperar un poco antes de republicar
        await new Promise(resolve => setTimeout(resolve, 500))

        // 4. Llamar al endpoint de publish existente para crear la publicación
        // Esto asegura que se use exactamente la misma lógica y formato
        const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL || ""
        
        // Obtener el template por defecto de la cuenta
        const { data: defaultTemplate } = await supabase
          .from("ml_publication_templates")
          .select("id")
          .eq("account_id", account_id)
          .eq("is_default", true)
          .single()
        
        const templateId = defaultTemplate?.id
        
        if (!templateId) {
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            status: "error", 
            error: "No hay template por defecto configurado - publicación eliminada sin republicar" 
          })
          errors++
          continue
        }

        // Determinar el modo de publicación basado en si tiene catalog_product_id
        const publishMode = currentItem.catalog_product_id ? "catalog" : "traditional"
        
        const publishResponse = await fetch(
          `${baseUrl}/api/ml/publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: product.id,
              template_id: templateId,
              account_id: account_id,
              preview_only: false,
              publish_mode: publishMode,
              force_republish: true // Evita verificación de duplicados
            })
          }
        )

        const publishResult = await publishResponse.json()
        
        if (publishResponse.ok && publishResult.success) {
          const newItem = publishResult.data
          console.log(`[v0] Nueva publicación creada: ${newItem.id} con seller_sku: ${product.ean}`)

          // Actualizar registro en ml_publications
          await supabase
            .from("ml_publications")
            .update({ 
              ml_item_id: newItem.id,
              status: newItem.status,
              updated_at: new Date().toISOString()
            })
            .eq("id", pub.id)

          republished++
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            status: "republished", 
            new_item_id: newItem.id 
          })
        } else {
          const createError = publishResult.error || publishResult
          console.error(`[v0] Error al crear nueva publicación:`, createError)
          
          // La publicación ya fue eliminada, solo registrar el error
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            status: "error", 
            error: createError.message || "Error al crear nueva publicación - publicación eliminada" 
          })
          errors++
        }

        // Delay entre publicaciones para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (err) {
        console.error(`[v0] Error procesando ${pub.ml_item_id}:`, err)
        results.push({ 
          ml_item_id: pub.ml_item_id, 
          status: "error", 
          error: "Error de conexión" 
        })
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      republished,
      errors,
      total: publications.length,
      message: `Republicadas: ${republished}, Errores: ${errors}`,
      results
    })
  } catch (error) {
    console.error("Error en republish-with-sku:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
