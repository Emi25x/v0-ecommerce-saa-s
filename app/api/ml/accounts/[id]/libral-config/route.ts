/**
 * PATCH /api/ml/accounts/[id]/libral-config
 *
 * Update platform_code and empresa_id for a ML account.
 * Used by the account card UI to configure Libral export mapping.
 */

import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-auth"

const VALID_PLATFORM_CODES = ["C1", "C2", "C3", "C4"]

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  const { id } = await params
  const body = await request.json()
  const { platform_code, empresa_id } = body as { platform_code?: string | null; empresa_id?: string | null }

  // Validate platform_code
  if (platform_code !== undefined && platform_code !== null && !VALID_PLATFORM_CODES.includes(platform_code)) {
    return NextResponse.json({ error: `platform_code debe ser uno de: ${VALID_PLATFORM_CODES.join(", ")}` }, { status: 400 })
  }

  // Check for duplicate platform_code among active accounts
  if (platform_code) {
    const { data: existing } = await auth.supabase
      .from("ml_accounts")
      .select("id, nickname")
      .eq("platform_code", platform_code)
      .neq("id", id)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({
        error: `platform_code ${platform_code} ya está asignado a la cuenta "${existing[0].nickname}"`,
      }, { status: 409 })
    }
  }

  // Validate empresa_id exists in arca_config
  if (empresa_id) {
    const { data: empresa } = await auth.supabase
      .from("arca_config")
      .select("id")
      .eq("id", empresa_id)
      .single()

    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 })
    }
  }

  const updates: Record<string, unknown> = {}
  if (platform_code !== undefined) updates.platform_code = platform_code
  if (empresa_id !== undefined) updates.empresa_id = empresa_id

  const { error } = await auth.supabase
    .from("ml_accounts")
    .update(updates)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
