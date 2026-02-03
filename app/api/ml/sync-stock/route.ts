import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Sincroniza el stock de productos publicados en ML con el stock actual de la BD
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id } = await request.json()

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta ML y verificar token
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Verificar si tiene auto_sync_stock habilitado
    if (!account.auto_sync_stock) {
      return NextResponse.json({ 
        success: false, 
        message: "Sincronización automática de stock deshabilitada para esta cuenta" 
      })
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

    // Obtener todas las publicaciones de esta cuenta
    const { data: publications, error: pubError } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, product_id")
      .eq("account_id", account_id)
      .eq("status", "active")

    if (pubError) {
      return NextResponse.json({ error: "Error al obtener publicaciones" }, { status: 500 })
    }

    if (!publications || publications.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No hay publicaciones activas para sincronizar",
        updated: 0 
      })
    }

    // Obtener el stock actual de cada producto
    const productIds = publications.map(p => p.product_id)
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, stock, title")
      .in("id", productIds)

    if (productsError) {
      return NextResponse.json({ error: "Error al obtener productos" }, { status: 500 })
    }

    const productStockMap = new Map(products?.map(p => [p.id, { stock: p.stock, title: p.title }]) || [])

    // Actualizar stock en ML para cada publicación
    let updated = 0
    let errors = 0
    const results: Array<{ ml_item_id: string; status: string; error?: string }> = []

    for (const pub of publications) {
      const productInfo = productStockMap.get(pub.product_id)
      if (!productInfo) continue

      const newStock = productInfo.stock || 0

      try {
        // Actualizar stock en ML
        const updateResponse = await fetch(`https://api.mercadolibre.com/items/${pub.ml_item_id}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            available_quantity: newStock
          })
        })

        if (updateResponse.ok) {
          updated++
          results.push({ ml_item_id: pub.ml_item_id, status: "updated" })
          
          // Actualizar fecha de sync en la publicación
          await supabase
            .from("ml_publications")
            .update({ 
              current_stock: newStock,
              last_sync_at: new Date().toISOString()
            })
            .eq("id", pub.id)
        } else {
          const errorData = await updateResponse.json()
          errors++
          results.push({ 
            ml_item_id: pub.ml_item_id, 
            status: "error", 
            error: errorData.message || "Error al actualizar" 
          })
        }

        // Pequeño delay para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err) {
        errors++
        results.push({ 
          ml_item_id: pub.ml_item_id, 
          status: "error", 
          error: "Error de conexión" 
        })
      }
    }

    // Actualizar estadísticas de la cuenta
    await supabase
      .from("ml_accounts")
      .update({
        last_stock_sync_at: new Date().toISOString(),
        stock_sync_count: updated
      })
      .eq("id", account_id)

    return NextResponse.json({
      success: true,
      updated,
      errors,
      total: publications.length,
      results
    })

  } catch (error) {
    console.error("Error en sync-stock:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}

// GET para ejecutar sync de todas las cuentas con auto_sync_stock habilitado
export async function GET() {
  try {
    const supabase = await createClient()

    // Obtener todas las cuentas con sync automático habilitado
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
          body: JSON.stringify({ account_id: account.id })
        })
        const data = await response.json()
        results.push({
          account: account.nickname,
          ...data
        })
      } catch (err) {
        results.push({
          account: account.nickname,
          error: "Error al sincronizar"
        })
      }
    }

    return NextResponse.json({
      success: true,
      accounts_processed: accounts.length,
      results
    })

  } catch (error) {
    console.error("Error en sync-stock GET:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
