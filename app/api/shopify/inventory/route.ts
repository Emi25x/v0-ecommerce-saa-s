import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

// GET /api/shopify/inventory?store_id=&product_id=
// Devuelve locations de la tienda + stock por location para todas las variantes del producto
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const product_id = searchParams.get("product_id")

    if (!store_id || !product_id) {
      return NextResponse.json({ error: "store_id y product_id son requeridos" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: store } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    const headers = {
      "X-Shopify-Access-Token": store.access_token,
      "Content-Type": "application/json",
    }
    const base = `https://${store.shop_domain}/admin/api/2024-01`

    // 1. Traer variantes del producto
    const varRes = await fetch(`${base}/products/${product_id}/variants.json`, { headers })
    const varJson = await varRes.json()
    const variants: Array<{ id: number; title: string; sku: string; inventory_item_id: number; inventory_quantity: number; price: string }> =
      varJson.variants ?? []

    // 2. Traer metafields del producto — incluye custom.sucursal_stock
    const metaRes = await fetch(`${base}/products/${product_id}/metafields.json`, { headers })
    const metaJson = await metaRes.json()
    const allMeta: Array<{ namespace: string; key: string; value: string; type: string }> = metaJson.metafields ?? []

    // Buscar el metafield de stock por sucursal
    const sucursalStockMeta = allMeta.find(m => m.namespace === "custom" && m.key === "sucursal_stock")

    // Parsear el valor — puede ser JSON string o string plano
    let sucursal_stock: Record<string, number> | null = null
    if (sucursalStockMeta?.value) {
      try {
        const parsed = JSON.parse(sucursalStockMeta.value)
        if (typeof parsed === "object" && parsed !== null) {
          sucursal_stock = parsed
        }
      } catch {
        // Si no es JSON, intentar interpretar como "España: 10, Argentina: 5"
        const parts = sucursalStockMeta.value.split(",")
        sucursal_stock = {}
        for (const part of parts) {
          const [k, v] = part.split(":").map(s => s.trim())
          if (k && v && !isNaN(Number(v))) sucursal_stock[k] = Number(v)
        }
        if (!Object.keys(sucursal_stock).length) sucursal_stock = null
      }
    }

    // 3. Traer todos los metafields de variantes para ver si hay stock por sucursal por variante
    const variantMetaPromises = variants.slice(0, 10).map(v =>
      fetch(`${base}/variants/${v.id}/metafields.json`, { headers })
        .then(r => r.json())
        .then(d => ({ variant_id: v.id, metafields: d.metafields ?? [] }))
        .catch(() => ({ variant_id: v.id, metafields: [] }))
    )
    const variantMetas = await Promise.all(variantMetaPromises)

    // Extraer sucursal_stock por variante si existe
    const variantSucursalStock: Record<number, Record<string, number>> = {}
    for (const vm of variantMetas) {
      const m = vm.metafields.find((mf: any) => mf.namespace === "custom" && mf.key === "sucursal_stock")
      if (m?.value) {
        try {
          variantSucursalStock[vm.variant_id] = JSON.parse(m.value)
        } catch { /* ignorar */ }
      }
    }

    return NextResponse.json({
      ok: true,
      variants,
      metafields: allMeta,
      sucursal_stock,         // stock a nivel producto
      variant_sucursal_stock: variantSucursalStock, // stock a nivel variante
    })
  } catch (e: any) {
    console.error("[SHOPIFY-INVENTORY]", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
