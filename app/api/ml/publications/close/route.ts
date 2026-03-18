import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

// POST /api/ml/publications/close
// Body: { ml_item_id: string, account_id: string }
// Cierra la publicación en MercadoLibre y actualiza el estado local.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { ml_item_id, account_id } = body

    if (!ml_item_id || !account_id) {
      return NextResponse.json(
        { ok: false, error: "ml_item_id y account_id son requeridos" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: account, error: accErr } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id")
      .eq("id", account_id)
      .single()

    if (accErr || !account) {
      return NextResponse.json({ ok: false, error: "Cuenta no encontrada" }, { status: 404 })
    }

    if (!account.access_token) {
      return NextResponse.json({ ok: false, error: "Sin token de acceso para esta cuenta" }, { status: 400 })
    }

    // Cerrar en ML API
    const mlRes = await fetch(`https://api.mercadolibre.com/items/${ml_item_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.access_token}`,
      },
      body: JSON.stringify({ status: "closed" }),
    })

    if (!mlRes.ok) {
      const mlErr = await mlRes.json().catch(() => ({}))
      return NextResponse.json(
        { ok: false, error: mlErr.message ?? `Error ML API: ${mlRes.status}`, ml_error: mlErr },
        { status: mlRes.status }
      )
    }

    // Actualizar estado en BD local
    const { error: updateErr } = await supabase
      .from("ml_publications")
      .update({ status: "closed" })
      .eq("account_id", account_id)
      .eq("ml_item_id", ml_item_id)

    if (updateErr) throw updateErr

    return NextResponse.json({ ok: true, ml_item_id })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
