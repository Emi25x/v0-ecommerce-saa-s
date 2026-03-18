/**
 * GET    /api/radar/tendencias/sellers  → lista vendedores monitoreados
 * POST   /api/radar/tendencias/sellers  → agregar vendedor { seller_id, nickname, store_name? }
 * DELETE /api/radar/tendencias/sellers?seller_id=XXX → eliminar
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("radar_watched_sellers")
    .select("*")
    .order("nickname")
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, sellers: data ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const { seller_id, nickname, store_name } = await req.json()
    if (!seller_id?.trim()) {
      return NextResponse.json({ ok: false, error: "seller_id requerido" }, { status: 400 })
    }

    // Si no viene nickname, intentar buscarlo en ML
    let resolvedNickname = nickname?.trim() || ""
    if (!resolvedNickname) {
      try {
        const supabaseTemp = await createClient()
        const { data: acc } = await supabaseTemp
          .from("ml_accounts")
          .select("id")
          .eq("is_active", true)
          .gt("token_expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle()

        if (acc?.id) {
          const token = await getValidAccessToken(acc.id)
          const res = await fetch(`https://api.mercadolibre.com/users/${seller_id}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8_000),
          })
          if (res.ok) {
            const user = await res.json()
            resolvedNickname = user.nickname || seller_id
          }
        }
      } catch {}
    }

    if (!resolvedNickname) resolvedNickname = String(seller_id)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("radar_watched_sellers")
      .upsert(
        { seller_id: String(seller_id), nickname: resolvedNickname, store_name: store_name ?? null },
        { onConflict: "seller_id" },
      )
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, seller: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const seller_id = new URL(req.url).searchParams.get("seller_id")
  if (!seller_id) return NextResponse.json({ ok: false, error: "seller_id requerido" }, { status: 400 })
  const supabase = await createClient()
  const { error } = await supabase.from("radar_watched_sellers").delete().eq("seller_id", seller_id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
