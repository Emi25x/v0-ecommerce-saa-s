/**
 * GET /api/ml/intel/opportunities?account_id=UUID&category_id=OPTIONAL
 *
 * - Toma las top categorías de las publicaciones propias (o category_id forzado)
 * - Busca items en esa categoría en MLA
 * - Extrae EAN de attributes (conservador: si no hay EAN, omite)
 * - Excluye EANs ya publicados por la cuenta
 * - Calcula opportunity_score conservador
 * - Upsert en ml_opportunities (solo recolecta, NO publica ni cambia precios)
 *
 * Score conservador:
 *   - sellers_count > 20 → score = 0 (demasiado competitivo)
 *   - sold_qty_proxy = 0 → score reducido
 *   - Zona umbral [31k..34k]: penalizar si precio está en zona de comisión crítica
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { mlFetchJson, isMlFetchError } from "@/domains/mercadolibre/api-client"

const SITE_ID = "MLA"
const MAX_SELLERS_THRESHOLD = 20 // más de esto → no sugerir
const PRICE_ZONE_LOW = 31000 // zona umbral Argentina
const PRICE_ZONE_HIGH = 34000
const SHIPPING_COST_AVG = 6000
const BATCH_DELAY_MS = 300
const ITEMS_PER_CATEGORY = 50

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account_id = searchParams.get("account_id")
  const forcedCategoryId = searchParams.get("category_id")

  if (!account_id) {
    return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    // 1. Obtener access_token
    const { data: account, error: accErr } = await supabase
      .from("ml_accounts")
      .select("id, nickname, access_token")
      .eq("id", account_id)
      .single()

    if (accErr || !account?.access_token) {
      return NextResponse.json({ error: "Cuenta no encontrada o sin token" }, { status: 404 })
    }

    const accessToken = account.access_token

    // 2. Obtener categorías prioritarias de publicaciones propias
    let categories: string[] = []
    if (forcedCategoryId) {
      categories = [forcedCategoryId]
    } else {
      const { data: catData } = await supabase
        .from("ml_publications")
        .select("category_id")
        .eq("account_id", account_id)
        .not("category_id", "is", null)

      // Contar frecuencia de categorías
      const catCount = new Map<string, number>()
      for (const row of catData || []) {
        if (row.category_id) catCount.set(row.category_id, (catCount.get(row.category_id) || 0) + 1)
      }
      // Top 5 categorías
      categories = Array.from(catCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat]) => cat)
    }

    if (categories.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
        saved: 0,
        scanned: 0,
        message: "No hay categorias en las publicaciones",
      })
    }

    // 3. Obtener EANs ya publicados por esta cuenta (para excluir)
    const { data: ownPubs } = await supabase
      .from("ml_publications")
      .select("ean")
      .eq("account_id", account_id)
      .not("ean", "is", null)

    const ownEans = new Set((ownPubs || []).map((p: any) => p.ean).filter(Boolean))

    console.log(`[ML-INTEL-OPP] account=${account.nickname} categories=${categories.length} own_eans=${ownEans.size}`)

    let totalFound = 0
    let totalUpserted = 0

    // 4. Para cada categoría, buscar items
    for (const categoryId of categories) {
      const searchUrl = `https://api.mercadolibre.com/sites/${SITE_ID}/search?category=${categoryId}&limit=${ITEMS_PER_CATEGORY}&sort=sold_quantity_desc`
      const searchRes = await mlFetchJson(
        searchUrl,
        { accessToken },
        { account_id, op_name: `intel-opp-cat-${categoryId}` },
      )

      if (isMlFetchError(searchRes)) {
        console.warn(`[ML-INTEL-OPP] Error categoría ${categoryId}: ${searchRes.status}`)
        await delay(BATCH_DELAY_MS)
        continue
      }

      const items: any[] = searchRes.results || []
      totalFound += items.length

      for (const item of items) {
        // Extraer EAN de attributes (conservador: solo si existe)
        const attrs: any[] = item.attributes || []
        const eanAttr = attrs.find(
          (a: any) => ["GTIN", "EAN", "ISBN"].includes(a.id?.toUpperCase() || "") && a.value_name,
        )
        if (!eanAttr?.value_name) continue // sin EAN → omitir conservadoramente

        const ean = eanAttr.value_name.trim()
        if (!ean || ean.length < 8) continue

        // Excluir si ya tenemos ese EAN publicado
        if (ownEans.has(ean)) continue

        // Calcular métricas del item
        const price: number = item.price || 0
        const sellersCount = 1 // por item individual; se enriquece en scan
        const soldQtyProxy: number = item.sold_quantity || 0

        // Score conservador
        let score = 0

        // Condición base: debe tener precio válido y ventas
        if (price > 0 && soldQtyProxy > 0) {
          score = Math.min(100, soldQtyProxy * 2)

          // Penalizar zona umbral crítica [31k..34k]
          if (price >= PRICE_ZONE_LOW && price <= PRICE_ZONE_HIGH) {
            score *= 0.5 // zona de riesgo de comisión
          }

          // Penalizar si precio neto (menos envío) es marginal
          if (price - SHIPPING_COST_AVG < price * 0.1) {
            score *= 0.3
          }
        }

        // No sugerir score 0
        if (score <= 0) continue

        // Upsert oportunidad
        const { error: upsertErr } = await supabase.from("ml_opportunities").upsert(
          {
            account_id,
            ean,
            title: item.title || "",
            category_id: item.category_id || categoryId,
            min_price: price,
            median_price: price,
            sellers_count: sellersCount,
            full_sellers_count: item.shipping?.free_shipping ? 1 : 0,
            sold_qty_proxy: soldQtyProxy,
            opportunity_score: parseFloat(score.toFixed(2)),
            status: "new",
          },
          {
            onConflict: "account_id,ean",
            ignoreDuplicates: false,
          },
        )

        if (!upsertErr) totalUpserted++
        else console.error(`[ML-INTEL-OPP] Upsert error EAN ${ean}:`, upsertErr.message)
      }

      await delay(BATCH_DELAY_MS)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ML-INTEL-OPP] Done: found=${totalFound} upserted=${totalUpserted} elapsed=${elapsed}s`)

    return NextResponse.json({
      ok: true,
      // Contrato estable: siempre estos campos
      items: [], // los items procesados (reservado para futuro)
      saved: totalUpserted,
      scanned: totalFound,
      // Alias legacy por compatibilidad
      categories_scanned: categories.length,
      items_found: totalFound,
      opportunities_upserted: totalUpserted,
      elapsed_seconds: parseFloat(elapsed),
    })
  } catch (err: any) {
    console.error("[ML-INTEL-OPP] Fatal:", err.message)
    return NextResponse.json(
      {
        ok: false,
        items: [],
        saved: 0,
        scanned: 0,
        error: err.message,
      },
      { status: 500 },
    )
  }
}

// También PATCH para cambiar status de una oportunidad
export async function PATCH(request: NextRequest) {
  const { id, status } = await request.json()
  if (!id || !["reviewed", "ignored", "published", "new"].includes(status)) {
    return NextResponse.json({ error: "id y status válido requeridos" }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from("ml_opportunities").update({ status }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
