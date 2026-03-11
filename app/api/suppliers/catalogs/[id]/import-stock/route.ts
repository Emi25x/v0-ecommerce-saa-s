import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"

// ─── EAN normalizer (handles Excel scientific notation) ───────────────────────
function normalizeEan(val: any): string | null {
  if (val == null) return null
  let s = String(val).trim()
  // e.g. 9.78844E+12
  if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
    const n = Number(s)
    if (!isNaN(n) && n > 0) s = Math.round(n).toString()
  }
  s = s.replace(/[^0-9]/g, "")
  if (s.length < 8 || s.length > 14) return null
  return s
}

/**
 * POST /api/suppliers/catalogs/[id]/import-stock
 *
 * Espera archivo en col A = EAN (puede ser científico), col B = stock.
 * Sin headers (o con headers detectados automáticamente).
 * Es un snapshot completo: EANs no presentes en la corrida quedan en 0.
 *
 * Body: { preview?: boolean, warehouse_id?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase  = createAdminClient()
  const catalogId = params.id
  const body      = await request.json()

  const previewOnly = body.preview === true
  const warehouseId: string | null = body.warehouse_id ?? null

  // ── Fetch catalog ──────────────────────────────────────────────────────────
  const { data: catalog, error: catErr } = await supabase
    .from("supplier_catalogs")
    .select("*, supplier:suppliers(*)")
    .eq("id", catalogId)
    .single()

  if (catErr || !catalog) {
    return NextResponse.json({ error: "Catálogo no encontrado" }, { status: 404 })
  }

  const supplierId = catalog.supplier_id

  // ── Download + parse ───────────────────────────────────────────────────────
  const fileRes = await fetch(catalog.file_url)
  if (!fileRes.ok) return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: 502 })
  const buffer = Buffer.from(await fileRes.arrayBuffer())

  const wb = XLSX.read(buffer, { type: "buffer", raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  // Use raw: true to avoid Excel auto-formatting EANs as numbers/dates
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })

  if (!rawRows.length) {
    return NextResponse.json({ error: "Archivo vacío" }, { status: 400 })
  }

  // Detect if first row is a header (if col A is text that doesn't look like an EAN)
  let startRow = 0
  const firstCell = String(rawRows[0]?.[0] ?? "").trim()
  const looksLikeHeader = isNaN(Number(firstCell.replace(/[^0-9]/g, ""))) || normalizeEan(firstCell) === null
  if (looksLikeHeader) startRow = 1

  // Parse EAN + stock
  const stockMap = new Map<string, number>()  // EAN → qty
  let totalRows = 0
  let validEan  = 0
  let invalid   = 0

  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i]
    totalRows++
    const ean = normalizeEan(row?.[0])
    const qty = parseInt(String(row?.[1] ?? "0").replace(/[^0-9]/g, "")) || 0
    if (!ean) { invalid++; continue }
    validEan++
    // Last occurrence wins for duplicate EANs in same file
    stockMap.set(ean, qty)
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  if (previewOnly) {
    // Fetch current supplier stock to compute delta
    const { data: currentStock } = await supabase
      .from("supplier_stock")
      .select("ean, quantity")
      .eq("supplier_id", supplierId)

    const currentMap = new Map<string, number>()
    for (const s of currentStock ?? []) currentMap.set(s.ean, s.quantity)

    const toZero = [...currentMap.keys()].filter(ean => !stockMap.has(ean)).length
    const sample = [...stockMap.entries()].slice(0, 5).map(([ean, qty]) => ({ ean, qty }))

    return NextResponse.json({
      ok:            true,
      preview:       true,
      total_rows:    totalRows,
      valid_ean:     validEan,
      skipped_invalid: invalid,
      unique_eans:   stockMap.size,
      set_zero_count: toZero,
      sample,
    })
  }

  // ── Apply snapshot ─────────────────────────────────────────────────────────

  // 1. Fetch all current EANs for this supplier to compute zeros
  const { data: existingRows } = await supabase
    .from("supplier_stock")
    .select("ean")
    .eq("supplier_id", supplierId)

  const existingEans = new Set((existingRows ?? []).map(r => r.ean))

  // Create run log
  const setZeroCount = [...existingEans].filter(ean => !stockMap.has(ean)).length

  const { data: runRow } = await supabase
    .from("supplier_import_runs")
    .insert({
      supplier_id:         supplierId,
      catalog_id:          catalogId,
      feed_kind:           "stock",
      warehouse_id:        warehouseId,
      total_rows:          totalRows,
      valid_ean:           validEan,
      skipped_count:       invalid,
      set_zero_stock_count: setZeroCount,
      status:              "running",
      started_at:          new Date().toISOString(),
    })
    .select("id")
    .single()
  const runId = runRow?.id

  // 2. Upsert all EANs from this file
  const upsertRows = [...stockMap.entries()].map(([ean, quantity]) => ({
    supplier_id:  supplierId,
    warehouse_id: warehouseId,
    ean,
    quantity,
    run_id:       runId,
    updated_at:   new Date().toISOString(),
  }))

  const CHUNK = 500
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    await supabase
      .from("supplier_stock")
      .upsert(upsertRows.slice(i, i + CHUNK), { onConflict: "supplier_id,ean" })
  }

  // 3. Zero out EANs not present in this snapshot
  const eansToZero = [...existingEans].filter(ean => !stockMap.has(ean))
  if (eansToZero.length > 0) {
    for (let i = 0; i < eansToZero.length; i += CHUNK) {
      await supabase
        .from("supplier_stock")
        .update({ quantity: 0, run_id: runId, updated_at: new Date().toISOString() })
        .eq("supplier_id", supplierId)
        .in("ean", eansToZero.slice(i, i + CHUNK))
    }
  }

  // 4. Propagate stock to products.stock_by_source + products.stock
  // Use supplier code as the source_key bucket (lowercase, alphanumeric only)
  const sourceKey = ((catalog.supplier as any)?.code ?? supplierId)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")

  let productsUpdated = 0

  // Update products with new stock values from this snapshot
  const allEans = [...stockMap.keys()]
  for (let i = 0; i < allEans.length; i += CHUNK) {
    const chunk = allEans.slice(i, i + CHUNK)
    const { data: prods } = await supabase
      .from("products")
      .select("id, ean, stock_by_source")
      .in("ean", chunk)

    if (!prods || prods.length === 0) continue

    const updates = prods.map((p: any) => {
      const newQty = stockMap.get(p.ean!) ?? 0
      const merged = { ...(p.stock_by_source ?? {}), [sourceKey]: newQty }
      const totalStock = Object.values(merged).reduce((s, v) => s + (Number(v) || 0), 0)
      return { id: p.id, stock_by_source: merged, stock: totalStock }
    })

    await supabase.from("products").upsert(updates, { onConflict: "id" })
    productsUpdated += updates.length
  }

  // Zero out products whose EANs were removed from this supplier's snapshot
  for (let i = 0; i < eansToZero.length; i += CHUNK) {
    const chunk = eansToZero.slice(i, i + CHUNK)
    const { data: prods } = await supabase
      .from("products")
      .select("id, ean, stock_by_source")
      .in("ean", chunk)

    if (!prods || prods.length === 0) continue

    const updates = prods.map((p: any) => {
      const merged = { ...(p.stock_by_source ?? {}), [sourceKey]: 0 }
      const totalStock = Object.values(merged).reduce((s, v) => s + (Number(v) || 0), 0)
      return { id: p.id, stock_by_source: merged, stock: totalStock }
    })

    await supabase.from("products").upsert(updates, { onConflict: "id" })
  }

  // Finalize run log
  if (runId) {
    await supabase.from("supplier_import_runs").update({
      status:              "completed",
      finished_at:         new Date().toISOString(),
      valid_ean:           validEan,
      set_zero_stock_count: setZeroCount,
      updated_count:       productsUpdated,
    }).eq("id", runId)
  }

  return NextResponse.json({
    ok:               true,
    total_rows:       totalRows,
    valid_ean:        validEan,
    unique_eans:      stockMap.size,
    set_zero_count:   setZeroCount,
    skipped_invalid:  invalid,
    products_updated: productsUpdated,
    source_key:       sourceKey,
    run_id:           runId,
  })
}
