import { createClient } from "@/lib/supabase/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  let itemId = searchParams.get("item_id")
  const showRecent = searchParams.get("recent") === "true"
  
  try {
    const supabase = await createClient()
    
    // Obtener cuenta ML con token
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .single()
    
    if (!account) {
      return NextResponse.json({ error: "No ML account found" }, { status: 404 })
    }
    
    // Refrescar token
    const validAccount = await refreshTokenIfNeeded(account)
    
    // Si se pide items recientes, buscar los últimos creados
    if (showRecent || !itemId) {
      const searchResponse = await fetch(
        `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=5&sort=date_desc`,
        { headers: { Authorization: `Bearer ${validAccount.access_token}` } }
      )
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json()
        if (searchData.results?.length > 0) {
          // Si no hay itemId específico, usar el más reciente
          if (!itemId) {
            itemId = searchData.results[0]
          }
          
          // Si se pide recent=true, devolver lista de IDs recientes
          if (showRecent) {
            return NextResponse.json({
              recent_items: searchData.results,
              total: searchData.paging?.total || 0,
              message: "Usa ?item_id=MLA... para ver detalles de un item específico"
            })
          }
        }
      }
    }
    
    if (!itemId) {
      return NextResponse.json({ error: "No item_id provided and no items found" }, { status: 400 })
    }
    
    // Obtener item completo con atributos
    const itemResponse = await fetch(
      `https://api.mercadolibre.com/items/${itemId}?include_attributes=all`,
      { headers: { Authorization: `Bearer ${validAccount.access_token}` } }
    )
    
    if (!itemResponse.ok) {
      const error = await itemResponse.text()
      return NextResponse.json({ error: `Failed to fetch item: ${error}` }, { status: itemResponse.status })
    }
    
    const item = await itemResponse.json()
    
    // Extraer solo la info relevante para publicar
    const relevantInfo = {
      id: item.id,
      title: item.title,
      category_id: item.category_id,
      price: item.price,
      currency_id: item.currency_id,
      available_quantity: item.available_quantity,
      buying_mode: item.buying_mode,
      condition: item.condition,
      listing_type_id: item.listing_type_id,
      
      // Atributos - lo más importante
      attributes: item.attributes?.map((attr: { id: string; name: string; value_id: string | null; value_name: string | null }) => ({
        id: attr.id,
        name: attr.name,
        value_id: attr.value_id,
        value_name: attr.value_name,
      })),
      
      // Otros campos útiles
      family_name: item.family_name,
      catalog_product_id: item.catalog_product_id,
      catalog_listing: item.catalog_listing,
      
      // Tags del item
      tags: item.tags,
    }
    
    return NextResponse.json(relevantInfo)
    
  } catch (error) {
    console.error("Error inspecting item:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
