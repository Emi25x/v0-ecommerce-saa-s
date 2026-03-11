import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"

// ─── Types ────────────────────────────────────────────────────────────────────
type CatalogMode   = "create_only" | "update_only" | "create_and_update"
type OverwriteMode = "none" | "only_empty_fields" | "all"

interface ParsedRow {
  ean:         string | null
  isbn:        string | null
  sku:         string | null
  title:       string | null
  author:      string | null
  publisher:   string | null
  price:       number | null
  stock:       number | null
  language:    string | null
  pages:       number | null
  binding:     string | null
  category:    string | null
  raw:         Record<string, any>
}

// ─── EAN normalizer ───────────────────────────────────────────────────────────
function normalizeEan(val: any): string | null {
  if (val == null) return null
  // Handle Excel scientific notation e.g. 9.78844E+12 → "9788440059680"
  let s = String(val).trim()
  if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
    const n = Number(s)
    if (!isNaN(n) && n > 0) s = Math.round(n).toString()
  }
  s = s.replace(/[^0-9]/g, "")
  if (s.length < 8 || s.length > 14) return null
  return s
}

// ─── Row parser ───────────────────────────────────────────────────────────────
function parseRow(row: Record<string, any>): ParsedRow {
  const g = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
      if (v != null && String(v).trim() !== "") return String(v).trim()
    }
    return null
  }
  const eanRaw  = g("EAN","ean","Ean","GTIN","gtin","barcode","Barcode")
  const isbnRaw = g("ISBN","isbn","Isbn")
  return {
    ean:       normalizeEan(eanRaw),
    isbn:      normalizeEan(isbnRaw),
    sku:       g("SKU","sku","Sku","codigo","CODIGO","Codigo","cod"),
    title:     g("Titulo","titulo","Title","title","TITULO","Descripcion","descripcion"),
    author:    g("Autor","autor","Author","author","AUTOR"),
    publisher: g("Editorial","editorial","Publisher","publisher","EDITORIAL","Sello","sello"),
    price:     parseFloat(g("Precio","precio","Price","price","PVP","pvp") ?? "0") || null,
    stock:     (() => { const v = parseInt(g("Stock","stock","Cantidad","cantidad","QTY","qty") ?? "0", 10); return isNaN(v) ? 0 : v })(),
    language:  g("Idioma","idioma","Language","language"),
    pages:     parseInt(g("Paginas","paginas","Pages","pages","PAGINAS") ?? "0") || null,
    binding:   g("Encuadernacion","encuadernacion","Binding","binding","Formato","formato"),
    category:  g("Categoria","categoria","Category","category","Materia","materia"),
    raw:       row,
  }
}

// ─── Parse file bytes into rows ───────────────────────────────────────────────
function parseFileBytes(buffer: Buffer, format: string): Record<string, any>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })
}

// ─── POST handler ─────────────────────────────────────────────────────────────
// Body: { preview?: boolean, catalog_mode?, overwrite_mode?, warehouse_id? }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase   = createAdminClient()
  const catalogId  = params.id
  const body       = await request.json()

  const previewOnly:   boolean       = body.preview === true
  const catalogMode:   CatalogMode   = body.catalog_mode   ?? "update_only"
  const overwriteMode: OverwriteMode = body.overwrite_mode ?? "only_empty_fields"
  const warehouseId:   string | null = body.warehouse_id   ?? null

  // ── Fetch catalog ──────────────────────────────────────────────────────────
  const { data: catalog, error: catErr } = await supabase
    .from("supplier_catalogs")
    .select("*, supplier:suppliers(*)")
    .eq("id", catalogId)
    .single()

  if (catErr || !catalog) {
    return NextResponse.json({ error: "Catálogo no encontrado" }, { status: 404 })
  }

  // ── If not preview-only, persist mode config on the catalog ───────────────
  if (!previewOnly) {
    await supabase.from("supplier_catalogs").update({
      catalog_mode:   catalogMode,
      overwrite_mode: overwriteMode,
      warehouse_id:   warehouseId,
      import_status:  "processing",
    }).eq("id", catalogId)
  }

  // ── Download file ──────────────────────────────────────────────────────────
  const fileRes = await fetch(catalog.file_url)
  if (!fileRes.ok) return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: 502 })
  const buffer = Buffer.from(await fileRes.arrayBuffer())

  let rawRows: Record<string, any>[]
  try {
    rawRows = parseFileBytes(buffer, catalog.file_format ?? "xlsx")
  } catch (e: any) {
    return NextResponse.json({ error: `Error al parsear archivo: ${e.message}` }, { status: 400 })
  }

  // ── Parse rows ─────────────────────────────────────────────────────────────
  const parsed  = rawRows.map(parseRow)
  const totalRows = parsed.length

  // Keep only rows with a valid EAN
  const withEan = parsed.filter(r => r.ean != null)
  const validEan = withEan.length
  const skippedInvalid = totalRows - validEan

  // Deduplicate by EAN (keep last occurrence)
  const byEan = new Map<string, ParsedRow>()
  for (const r of withEan) byEan.set(r.ean!, r)
  const uniqueRows = Array.from(byEan.values())

  // ── Load existing products index ───────────────────────────────────────────
  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, ean, isbn, title, author, brand, language, pages, binding, category, description, image_url, price")
    .or("ean.not.is.null,isbn.not.is.null")

  const eanToProduct = new Map<string, any>()
  for (const p of existingProducts ?? []) {
    if (p.ean)  eanToProduct.set(p.ean.replace(/[^0-9]/g, ""),  p)
    if (p.isbn) eanToProduct.set(p.isbn.replace(/[^0-9]/g, ""), p)
  }

  // ── Classify rows ──────────────────────────────────────────────────────────
  const toCreate:  ParsedRow[] = []
  const toUpdate:  ParsedRow[] = []
  const toSkip:    ParsedRow[] = []   // new EANs discarded by mode constraints
  const newDetectedEans: string[] = []

  for (const row of uniqueRows) {
    const exists = eanToProduct.has(row.ean!)
    if (exists) {
      if (catalogMode === "create_only") {
        toSkip.push(row)
      } else {
        toUpdate.push(row)
      }
    } else {
      newDetectedEans.push(row.ean!)
      if (catalogMode === "update_only") {
        toSkip.push(row)   // detected but not created
      } else {
        // create_only or create_and_update
        toCreate.push(row)
      }
    }
  }

  // ── Preview mode: return stats without touching DB ─────────────────────────
  if (previewOnly) {
    return NextResponse.json({
      ok:              true,
      preview:         true,
      total_rows:      totalRows,
      valid_ean:       validEan,
      skipped_invalid: skippedInvalid,
      existing:        toUpdate.length + (catalogMode === "create_only" ? toSkip.filter(r => eanToProduct.has(r.ean!)).length : 0),
      to_create:       toCreate.length,
      to_update:       toUpdate.length,
      to_skip:         toSkip.length,
      new_detected:    newDetectedEans.length,
      new_detected_eans: newDetectedEans.slice(0, 20),   // muestra hasta 20 en preview
      sample_rows:     uniqueRows.slice(0, 5).map(r => ({
        ean: r.ean, title: r.title, author: r.author, publisher: r.publisher, price: r.price,
      })),
    })
  }

  // ── APPLY MODE ─────────────────────────────────────────────────────────────

  // Create import run log
  const { data: runRow } = await supabase
    .from("supplier_import_runs")
    .insert({
      supplier_id:        catalog.supplier_id,
      catalog_id:         catalogId,
      feed_kind:          "catalog",
      catalog_mode:       catalogMode,
      overwrite_mode:     overwriteMode,
      warehouse_id:       warehouseId,
      total_rows:         totalRows,
      valid_ean:          validEan,
      new_detected_count: newDetectedEans.length,
      new_detected_eans:  newDetectedEans.slice(0, 500),
      status:             "running",
      started_at:         new Date().toISOString(),
    })
    .select("id")
    .single()
  const runId = runRow?.id

  let createdCount = 0
  let updatedCount = 0
  let errorCount   = 0

  // ── CREATE new products ────────────────────────────────────────────────────
  if (toCreate.length > 0) {
    const newProducts = toCreate.map(r => ({
      ean:         r.ean,
      isbn:        r.isbn,
      sku:         r.sku ?? (r.ean ? `EAN-${r.ean}` : null),
      title:       r.title ?? "Sin título",
      author:      r.author,
      brand:       r.publisher,
      language:    r.language,
      pages:       r.pages,
      binding:     r.binding,
      category:    r.category,
      price:       r.price,
      stock:       0,
      source:      ["supplier_catalog"],
    }))

    const CHUNK = 200
    for (let i = 0; i < newProducts.length; i += CHUNK) {
      const { data: inserted, error: insErr } = await supabase
        .from("products")
        .insert(newProducts.slice(i, i + CHUNK))
        .select("id")
      if (insErr) { errorCount += newProducts.slice(i, i + CHUNK).length }
      else { createdCount += inserted?.length ?? 0 }
    }
  }

  // ── UPDATE existing products ───────────────────────────────────────────────
  if (toUpdate.length > 0 && overwriteMode !== "none") {
    // Build patches for all rows that need updating
    const patches: { id: string; patch: Record<string, any> }[] = []

    for (const row of toUpdate) {
      const existing = eanToProduct.get(row.ean!)
      if (!existing) continue

      const patch: Record<string, any> = {}
      const shouldWrite = (field: string, newVal: any) => {
        if (newVal == null) return false
        if (overwriteMode === "all") return true
        if (overwriteMode === "only_empty_fields") {
          return existing[field] == null || existing[field] === "" || existing[field] === 0
        }
        return false
      }

      if (shouldWrite("title",    row.title))     patch.title     = row.title
      if (shouldWrite("author",   row.author))    patch.author    = row.author
      if (shouldWrite("brand",    row.publisher)) patch.brand     = row.publisher
      if (shouldWrite("language", row.language))  patch.language  = row.language
      if (shouldWrite("pages",    row.pages))     patch.pages     = row.pages
      if (shouldWrite("binding",  row.binding))   patch.binding   = row.binding
      if (shouldWrite("category", row.category))  patch.category  = row.category
      if (shouldWrite("price",    row.price))     patch.price     = row.price
      if (row.isbn && shouldWrite("isbn", row.isbn)) patch.isbn   = row.isbn

      if (Object.keys(patch).length > 0) {
        patches.push({ id: existing.id, patch })
      }
    }

    // Run updates in parallel batches of 50 to avoid N serial round-trips
    const PARALLEL = 50
    for (let i = 0; i < patches.length; i += PARALLEL) {
      const batch = patches.slice(i, i + PARALLEL)
      const results = await Promise.allSettled(
        batch.map(({ id, patch }) =>
          supabase.from("products").update(patch).eq("id", id)
        )
      )
      for (const res of results) {
        if (res.status === "fulfilled" && !res.value.error) updatedCount++
        else errorCount++
      }
    }
  }

  // ── Upsert supplier_catalog_items ─────────────────────────────────────────
  const itemsToInsert = uniqueRows.map(row => {
    const existing = eanToProduct.get(row.ean!)
    return {
      catalog_id:     catalogId,
      supplier_id:    catalog.supplier_id,
      product_id:     existing?.id ?? null,
      warehouse_id:   warehouseId,
      supplier_ean:   row.ean,
      supplier_isbn:  row.isbn,
      supplier_sku:   row.sku,
      title:          row.title ?? "",
      author:         row.author,
      publisher:      row.publisher,
      price_original: row.price,
      stock_quantity: row.stock,
      matched_by:     existing ? "ean" : null,
      matched_at:     existing ? new Date().toISOString() : null,
      match_confidence: existing ? 1.0 : null,
      raw_data:       row.raw,
    }
  })

  const CHUNK = 500
  for (let i = 0; i < itemsToInsert.length; i += CHUNK) {
    await supabase.from("supplier_catalog_items").insert(itemsToInsert.slice(i, i + CHUNK))
  }

  // ── Finalize ───────────────────────────────────────────────────────────────
  const skippedCount = toSkip.length + skippedInvalid

  await supabase.from("supplier_catalogs").update({
    import_status: "completed",
    imported_at:   new Date().toISOString(),
    total_items:   totalRows,
    matched_items: toUpdate.length + createdCount,
  }).eq("id", catalogId)

  if (runId) {
    await supabase.from("supplier_import_runs").update({
      status:        "completed",
      finished_at:   new Date().toISOString(),
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      error_count:   errorCount,
    }).eq("id", runId)
  }

  return NextResponse.json({
    ok:            true,
    total_rows:    totalRows,
    valid_ean:     validEan,
    created:       createdCount,
    updated:       updatedCount,
    skipped:       skippedCount,
    errors:        errorCount,
    new_detected:  newDetectedEans.length,
    run_id:        runId,
  })
}
