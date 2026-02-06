import { createClient } from '@/utils/supabase/server'

const csvContent = `ITEM_ID;USER_ID;SKU;TITLE;BUYING_MODE;CATEGORY_ID;CONDITION;CURRENCY_ID;DATE_CREATED;INITIAL_QUANTITY;LISTING_TYPE_ID;PRICE;SALE_TERMS_ID;SALE_TERMS_NAME;SALE_TERMS_VALUE_ID;SALE_TERMS_VALUE_NAME;QUANTITY;STATUS;SUB_STATUS;THUMBNAIL;WARRANTY;LOGISTIC_TYPE;WARRANTY_ID;WARRANTY_NAME;WARRANTY_TYPE;PERMALINK
MLA1511041553;1962626024;9788466364041;Los Divinos Los Divinos - Planeta;buy_it_now;MLA3025;new;ARS;2024-03-23T15:35:50.000Z;47;gold_special;14889;WARRANTY_TYPE;Garantía del vendedor;242085;Sin garantía;36;active;[...]; (continúa con todas las filas del CSV que ya tengo)`

export async function importCSV() {
  const supabase = await createClient()
  
  // Obtener primera cuenta de ML
  const { data: accounts } = await supabase
    .from("ml_accounts")
    .select("*")
    .limit(1)
  
  if (!accounts || accounts.length === 0) {
    console.error("No hay cuentas de ML")
    return
  }
  
  const account = accounts[0]
  console.log(`[v0] Usando cuenta: ${account.nickname}`)
  
  // Parsear CSV
  const lines = csvContent.trim().split('\n')
  const headers = lines[0].split(';')
  
  let processed = 0
  let linked = 0
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';')
    const row: any = {}
    headers.forEach((header, index) => {
      row[header] = values[index]
    })
    
    const itemId = row.ITEM_ID
    const sku = row.SKU
    
    if (!itemId) continue
    
    // Buscar producto por SKU
    let product_id = null
    if (sku) {
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("ean", sku)
        .maybeSingle()
      
      if (product) {
        product_id = product.id
        linked++
      }
    }
    
    // Verificar si existe
    const { data: existing } = await supabase
      .from("ml_publications")
      .select("id")
      .eq("ml_item_id", itemId)
      .maybeSingle()
    
    const pubData = {
      account_id: account.id,
      ml_item_id: itemId,
      product_id,
      title: row.TITLE,
      price: parseFloat(row.PRICE) || 0,
      current_stock: parseInt(row.QUANTITY) || 0,
      status: row.STATUS,
      permalink: row.PERMALINK,
      updated_at: new Date().toISOString()
    }
    
    if (existing) {
      await supabase.from("ml_publications").update(pubData).eq("id", existing.id)
    } else {
      await supabase.from("ml_publications").insert(pubData)
    }
    
    processed++
    if (processed % 100 === 0) {
      console.log(`[v0] Procesados: ${processed}, Vinculados: ${linked}`)
    }
  }
  
  console.log(`[v0] Completado: ${processed} procesados, ${linked} vinculados`)
}
