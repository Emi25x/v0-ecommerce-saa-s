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
    let matchedCount = 0

    for (const row of rows) {
      const isbn = row.ISBN || row.isbn || row.Isbn || ""
      const ean = row.EAN || row.ean || row.Ean || ""
      const sku = row.SKU || row.sku || row.Sku || ""
      const title = row.Titulo || row.titulo || row.Title || row.title || ""
      const author = row.Autor || row.autor || row.Author || row.author || ""
      const publisher = row.Editorial || row.editorial || row.Publisher || row.publisher || ""
      const price = parseFloat(row.Precio || row.precio || row.Price || row.price || "0")
      const stock = parseInt(row.Stock || row.stock || "0")

      // Attempt matching
      let productId: string | null = null
      let matchedBy: string | null = null

      if (isbn) {
        const normalized = isbn.replace(/[^0-9]/g, "")
        if (isbnIndex.has(normalized)) {
          productId = isbnIndex.get(normalized)!
          matchedBy = "isbn"
          matchedCount++
        }
      }

      if (!productId && ean) {
        const normalized = ean.replace(/[^0-9]/g, "")
        if (eanIndex.has(normalized)) {
          productId = eanIndex.get(normalized)!
          matchedBy = "ean"
          matchedCount++
        }
      }

      if (!productId && sku) {
        const normalized = sku.trim().toLowerCase()
        if (skuIndex.has(normalized)) {
          productId = skuIndex.get(normalized)!
          matchedBy = "sku"
          matchedCount++
        }
      }

      itemsToInsert.push({
        catalog_id: catalogId,
        supplier_id: catalog.supplier_id,
        product_id: productId,
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
