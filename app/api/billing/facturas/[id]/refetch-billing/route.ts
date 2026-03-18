import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"
import { NextResponse } from "next/server"
import { getMLOrderBilling } from "@/domains/billing/ml-order-billing"
import { normalizeDocType } from "@/domains/billing/doc-type"

/**
 * POST /api/billing/facturas/{id}/refetch-billing
 *
 * Re-obtiene los datos fiscales del comprador desde ML y actualiza
 * la factura con el DNI/nombre correcto.
 *
 * Solo actualiza campos del receptor (nunca CAE ni totales).
 * Requiere que la factura tenga orden_id y que la cuenta ML esté conectada.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Buscar la factura
    const { data: factura, error: fetchErr } = await supabase
      .from("facturas")
      .select("id, orden_id, user_id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single()

    if (fetchErr || !factura) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    if (!factura.orden_id) {
      return NextResponse.json({ error: "Esta factura no tiene orden_id de ML asociada" }, { status: 400 })
    }

    // Buscar la cuenta ML del usuario
    const adminClient = createAdminClient()
    const { data: mlAccount } = await adminClient
      .from("ml_accounts")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (!mlAccount) {
      return NextResponse.json({ error: "No se encontró cuenta ML conectada" }, { status: 400 })
    }

    // Re-fetchear billing forzando refresh del cache
    const bi = await getMLOrderBilling(supabase, mlAccount.id, factura.orden_id, { forceRefresh: true })

    if (!bi.ok) {
      return NextResponse.json({ error: bi.error || "Error al obtener datos fiscales de ML" }, { status: 500 })
    }

    // Construir patch con los datos obtenidos
    const patch: Record<string, any> = {
      billing_info_snapshot: {
        nombre:        bi.nombre,
        doc_tipo:      bi.doc_tipo,
        doc_numero:    bi.doc_numero,
        condicion_iva: bi.condicion_iva,
        direccion:     bi.direccion,
        missing:       bi.billing_info_missing ?? false,
      },
    }

    if (bi.nombre) {
      patch.razon_social_receptor = bi.nombre
    }

    if (bi.condicion_iva) {
      patch.receptor_condicion_iva = bi.condicion_iva
    }

    if (bi.direccion) {
      patch.receptor_domicilio = bi.direccion
    }

    if (bi.doc_numero) {
      patch.tipo_doc_receptor = normalizeDocType(bi.doc_tipo)
      patch.nro_doc_receptor = String(bi.doc_numero).replace(/\D/g, "")
    }

    const { data: updated, error: updateErr } = await supabase
      .from("facturas")
      .update(patch)
      .eq("id", params.id)
      .select()
      .single()

    if (updateErr) throw updateErr

    return NextResponse.json({
      ok:      true,
      factura: updated,
      billing: bi,
      patched: Object.keys(patch).filter(k => k !== "billing_info_snapshot"),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
