import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import Papa from "papaparse"

/**
 * POST /api/suppliers/catalogs/[id]/import
 * Importa items desde el catálogo CSV/XLSX
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const catalogId = params.id
    const body = await request.json()
    const warehouseId = body.warehouse_id || null
    
    const supabase = await createClient({ useServiceRole: true })

    // Get catalog info
    const { data: catalog, error: catalogError } = await supabase
      .from("supplier_catalogs")
      .select("*, supplier:suppliers(*)")
      .eq("id", catalogId)
      .single()

    if (catalogError || !catalog) {
      return NextResponse.json({ error: "Catalog not found" }, { status: 404 })
    }
    
    console.log(`[CATALOG-IMPORT] Importing catalog ${catalogId} to warehouse ${warehouseId || 'default'}`)

    // Update status to processing
    await supabase
      .from("supplier_catalogs")
      .update({ import_status: "processing" })
      .eq("id", catalogId)

    // Fetch CSV from Blob
    const response = await fetch(catalog.file_url)
    const csvText = await response.text()

    // Parse CSV
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    })

    if (parsed.errors.length > 0) {
      throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
    }

    const rows = parsed.data as any[]
    console.log(`[CATALOG-IMPORT] Processing ${rows.length} rows`)

    // Load all products for matching
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, isbn, ean, sku")
      .or("isbn.not.is.null,ean.not.is.null,sku.not.is.null")

    // Build indexes for matching
    const isbnIndex = new Map<string, string>()
    const eanIndex = new Map<string, string>()
    const skuIndex = new Map<string, string>()

    for (const product of allProducts || []) {
      if (product.isbn) isbnIndex.set(product.isbn.replace(/[^0-9]/g, ""), product.id)
      if (product.ean) eanIndex.set(product.ean.replace(/[^0-9]/g, ""), product.id)
      if (product.sku) skuIndex.set(product.sku.trim().toLowerCase(), product.id)
    }

    // Process rows and match with products
    const itemsToInsert: any[] = []
    const productsToCreate: any[] = []
    let matchedCount = 0
    let createdCount = 0

    for (const row of rows) {
      const isbn = row.ISBN || row.isbn || row.Isbn || ""
      const ean = row.EAN || row.ean || row.Ean || ""
      const sku = row.SKU || row.sku || row.Sku || ""
      const title = row.Titulo || row.titulo || row.Title || row.title || ""
      const author = row.Autor || row.autor || row.Author || row.author || ""
      const publisher = row.Editorial || row.editorial || row.Publisher || row.publisher || ""
      const price = parseFloat(row.Precio || row.precio || row.Price || row.price || "0")
      const stock = parseInt(row.Stock || row.stock || "0")

      // Normalize identifiers
      const isbnNormalized = isbn ? isbn.replace(/[^0-9]/g, "") : ""
      const eanNormalized = ean ? ean.replace(/[^0-9]/g, "") : ""
      const skuNormalized = sku ? sku.trim().toLowerCase() : ""

      // Attempt matching - Priority: EAN → ISBN → SKU
      let productId: string | null = null
      let matchedBy: string | null = null

      // Try EAN first
      if (eanNormalized && eanIndex.has(eanNormalized)) {
        productId = eanIndex.get(eanNormalized)!
        matchedBy = "ean"
        matchedCount++
      }

      // Try ISBN second
      if (!productId && isbnNormalized && isbnIndex.has(isbnNormalized)) {
        productId = isbnIndex.get(isbnNormalized)!
        matchedBy = "isbn"
        matchedCount++
      }

      // Try SKU last
      if (!productId && skuNormalized && skuIndex.has(skuNormalized)) {
        productId = skuIndex.get(skuNormalized)!
        matchedBy = "sku"
        matchedCount++
      }

      // If no match found and we have EAN or ISBN, create a new product
      if (!productId && (eanNormalized || isbnNormalized)) {
        // Check if we already queued this product for creation in this batch
        const alreadyQueued = productsToCreate.some(p => 
          (p.ean && p.ean === eanNormalized) || 
          (p.isbn && p.isbn === isbnNormalized)
        )

        if (!alreadyQueued) {
          // Generate a unique SKU if not provided
          const generatedSku = sku || 
            (eanNormalized ? `EAN-${eanNormalized}` : `ISBN-${isbnNormalized}`)

          const newProduct = {
            sku: generatedSku,
            title: title || "Sin título",
            isbn: isbnNormalized || null,
            ean: eanNormalized || null,
            author: author || null,
            publisher: publisher || null,
            price: price || 0,
            stock: 0, // Don't set stock from supplier
            source: ["supplier_catalog"],
            description: `Importado desde catálogo ${catalog.name}`,
            custom_fields: {
              supplier_name: catalog.supplier?.name || "Unknown",
              catalog_id: catalogId
            }
          }

          productsToCreate.push(newProduct)
          console.log(`[CATALOG-IMPORT] Queuing new product: ${title} (${eanNormalized || isbnNormalized})`)
        }
      }

      itemsToInsert.push({
        catalog_id: catalogId,
        supplier_id: catalog.supplier_id,
        product_id: productId,
        warehouse_id: warehouseId,
        supplier_sku: sku || null,
        supplier_isbn: isbn || null,
        supplier_ean: ean || null,
        title,
        author: author || null,
        publisher: publisher || null,
        price_original: price,
        price_discounted: price,
        stock_quantity: stock,
        matched_by: matchedBy,
        matched_at: matchedBy ? new Date().toISOString() : null,
        match_confidence: matchedBy ? 1.0 : null,
        raw_data: row
      })
    }

    // Create new products if any
    const createdProductIds = new Map<string, string>() // key: ean or isbn, value: product_id
    
    if (productsToCreate.length > 0) {
      console.log(`[CATALOG-IMPORT] Creating ${productsToCreate.length} new products`)
      
      const { data: newProducts, error: createError } = await supabase
        .from("products")
        .insert(productsToCreate)
        .select("id, isbn, ean")

      if (createError) {
        console.error(`[CATALOG-IMPORT] Error creating products:`, createError)
        // Continue with import even if product creation fails
      } else if (newProducts) {
        createdCount = newProducts.length
        console.log(`[CATALOG-IMPORT] Created ${createdCount} new products`)
        
        // Build index of created products
        for (const product of newProducts) {
          const key = product.ean || product.isbn
          if (key) {
            createdProductIds.set(key, product.id)
          }
        }

        // Update itemsToInsert with newly created product IDs
        for (const item of itemsToInsert) {
          if (!item.product_id) {
            const eanNormalized = item.supplier_ean ? item.supplier_ean.replace(/[^0-9]/g, "") : ""
            const isbnNormalized = item.supplier_isbn ? item.supplier_isbn.replace(/[^0-9]/g, "") : ""
            
            // Try to find the newly created product
            const newProductId = createdProductIds.get(eanNormalized) || 
                                createdProductIds.get(isbnNormalized)
            
            if (newProductId) {
              item.product_id = newProductId
              item.matched_by = eanNormalized ? "ean" : "isbn"
              item.matched_at = new Date().toISOString()
              item.match_confidence = 1.0
              matchedCount++
            }
          }
        }
      }
    }

    // Batch insert items
    const { error: insertError } = await supabase
      .from("supplier_catalog_items")
      .insert(itemsToInsert)

    if (insertError) throw insertError

    // Update catalog with results
    await supabase
      .from("supplier_catalogs")
      .update({
        import_status: "completed",
        imported_at: new Date().toISOString(),
        total_items: rows.length,
        matched_items: matchedCount
      })
      .eq("id", catalogId)

    return NextResponse.json({
      success: true,
      total_items: rows.length,
      matched_items: matchedCount,
      created_products: createdCount,
      match_rate: ((matchedCount / rows.length) * 100).toFixed(1)
    })
  } catch (error: any) {
    console.error("[CATALOG-IMPORT] Error:", error)

    // Update catalog with error
    const supabase = await createClient({ useServiceRole: true })
    await supabase
      .from("supplier_catalogs")
      .update({
        import_status: "failed",
        import_error: error.message
      })
      .eq("id", params.id)

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
