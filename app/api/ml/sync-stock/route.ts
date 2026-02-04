import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 300

// Sincroniza stock: toma productos de nuestra DB y actualiza ML por EAN/SKU
// Si la actualización es exitosa, el producto queda vinculado
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id, limit = 100, offset = 0 } = await request.json()

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

    // Obtener productos de nuestra DB que tienen EAN y stock
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, ean, stock, title")
      .not("ean", "is", null)
      .not("ean", "eq", "")
      .range(offset, offset + limit - 1)

    if (productsError || !products) {
      return NextResponse.json({ error: "Error al obtener productos" }, { status: 500 })
    }

    let updated = 0
    let linked = 0
    let notFoundInML = 0
    let errors = 0

    // Procesar cada producto
    for (const product of products) {
      try {
        // Intentar actualizar stock en ML usando el EAN como seller_sku
        // ML busca la publicación por seller_sku (que es nuestro EAN)
        const updateResponse = await fetch(
          `https://api.mercadolibre.com/items/${account.ml_user_id}:${product.ean}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ available_quantity: product.stock || 0 })
          }
        )

        if (updateResponse.ok) {
          // La actualización fue exitosa - hay publicación con este EAN
          const updatedItem = await updateResponse.json()
          updated++

          // Verificar si ya existe en ml_publications
          const { data: existingPub } = await supabase
            .from("ml_publications")
            .select("id, product_id")
            .eq("ml_item_id", updatedItem.id)
            .maybeSingle()

          if (existingPub) {
            // Actualizar y vincular si no estaba vinculado
            if (!existingPub.product_id) {
              await supabase
                .from("ml_publications")
                .update({ 
                  product_id: product.id,
                  current_stock: product.stock || 0,
                  last_sync_at: new Date().toISOString()
                })
                .eq("id", existingPub.id)
              linked++
            } else {
              // Solo actualizar stock y fecha
              await supabase
                .from("ml_publications")
                .update({ 
                  current_stock: product.stock || 0,
                  last_sync_at: new Date().toISOString()
                })
                .eq("id", existingPub.id)
            }
          } else {
            // Crear nueva entrada vinculada
            await supabase.from("ml_publications").insert({
              account_id: account.id,
              ml_item_id: updatedItem.id,
              product_id: product.id,
              title: updatedItem.title || product.title,
              status: updatedItem.status || "active",
              current_stock: product.stock || 0,
              last_sync_at: new Date().toISOString()
            })
            linked++
          }
        } else if (updateResponse.status === 404) {
          // No hay publicación con este EAN en ML
          notFoundInML++
        } else if (updateResponse.status === 429) {
          // Rate limit - devolver lo que tenemos
          return NextResponse.json({
            success: true,
            rate_limited: true,
            message: "Rate limit alcanzado. Continuar más tarde.",
            processed: products.indexOf(product),
            updated,
            linked,
            not_found_in_ml: notFoundInML,
            errors
          })
        } else {
          errors++
        }

        // Delay para no saturar ML API (200ms entre requests)
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (error) {
        console.error("Error updating product:", product.ean, error)
        errors++
      }
    }

    // Actualizar estadísticas de la cuenta
    await supabase.from("ml_accounts").update({
      last_stock_sync_at: new Date().toISOString(),
      stock_sync_count: (account.stock_sync_count || 0) + updated
    }).eq("id", account_id)

    return NextResponse.json({
      success: true,
      processed: products.length,
      updated,
      linked,
      not_found_in_ml: notFoundInML,
      errors,
      has_more: products.length === limit
    })

  } catch (error) {
    console.error("Error en sync-stock:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 })
  }
}

// GET para ejecutar sync de todas las cuentas con auto_sync_stock habilitado
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: accounts, error } = await supabase
      .from("ml_accounts")
      .select("id, nickname")
      .eq("auto_sync_stock", true)

    if (error || !accounts) {
      return NextResponse.json({ error: "Error al obtener cuentas" }, { status: 500 })
    }

    const results = []
    for (const account of accounts) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || ""}/api/ml/sync-stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: account.id, limit: 500 })
        })
        const data = await response.json()
        results.push({ account: account.nickname, ...data })
      } catch (err) {
        results.push({ account: account.nickname, error: "Error al sincronizar" })
      }
    }

    return NextResponse.json({
      success: true,
      accounts_processed: accounts.length,
      results
    })

  } catch (error) {
    console.error("Error en sync-stock GET:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno" }, { status: 500 })
  }
}
