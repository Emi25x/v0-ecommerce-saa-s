/**
 * POST /api/competition/analyze
 *
 * Consulta price_to_win para un ítem ML y retorna los datos de competencia.
 * No persiste nada — solo consulta en tiempo real.
 * Token: primero busca en ml_publications → ml_accounts, fallback a cualquier cuenta activa.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

export async function POST(req: NextRequest) {
  try {
    const { item_id } = await req.json()

    if (!item_id) {
      return NextResponse.json({ success: false, error: "item_id es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Buscar account_id desde ml_publications (fuente de verdad)
    let account_id: string | null = null

    const { data: pub } = await supabase
      .from("ml_publications")
      .select("account_id")
      .eq("ml_item_id", item_id)
      .maybeSingle()

    if (pub?.account_id) {
      account_id = pub.account_id
    } else {
      // Fallback: cualquier cuenta activa con token no vencido
      const { data: acc } = await supabase
        .from("ml_accounts")
        .select("id")
        .gt("token_expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle()

      if (!acc?.id) {
        return NextResponse.json(
          { success: false, error: "No se encontró una cuenta de MercadoLibre activa" },
          { status: 401 },
        )
      }
      account_id = acc.id
    }

    // Obtener token fresco (refresca si está por vencer)
    const accessToken = await getValidAccessToken(account_id!)

    const res = await fetch(
      `https://api.mercadolibre.com/items/${item_id}/price_to_win?siteId=MLA&version=v2`,
      {
        headers:  { Authorization: `Bearer ${accessToken}` },
        signal:   AbortSignal.timeout(10_000),
      },
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[competition/analyze] price_to_win error: ${res.status} ${errText}`)
      return NextResponse.json(
        { success: false, error: `ML API error: ${res.status}` },
        { status: res.status },
      )
    }

    const d = await res.json()

    return NextResponse.json({
      success: true,
      competition: {
        status:                         d.status,
        current_price:                  d.current_price,
        price_to_win:                   d.price_to_win,
        currency_id:                    d.currency_id,
        visit_share:                    d.visit_share,
        competitors_sharing_first_place: d.competitors_sharing_first_place || 0,
        boosts:                         d.boosts || [],
        winner_item_id:                 d.winner?.item_id   || null,
        winner_price:                   d.winner?.price     || null,
        winner_stock:                   d.winner?.available_quantity ?? null,
        catalog_product_id:             d.catalog_product_id || null,
        winner: d.winner
          ? {
              seller_id:  d.winner.seller_id || null,
              nickname:   d.winner.nickname  || "Desconocido",
              price:      d.winner.price     || null,
              stock:      d.winner.available_quantity ?? null,
              advantages: d.winner.boosts    || [],
            }
          : null,
      },
      message: `Estado: ${d.status}`,
    })
  } catch (e: any) {
    console.error("[competition/analyze] Error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
