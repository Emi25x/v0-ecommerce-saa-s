import { NextRequest, NextResponse } from "next/server"
import { consultarPersona } from "@/lib/arca/padron"

export async function GET(req: NextRequest) {
  const cuit = req.nextUrl.searchParams.get("cuit")?.replace(/\D/g, "")
  if (!cuit || (cuit.length !== 11 && cuit.length !== 8 && cuit.length !== 7)) {
    return NextResponse.json({ ok: false, error: "Ingresá un CUIT (11 dígitos) o DNI (7-8 dígitos) válido" }, { status: 400 })
  }
  const result = await consultarPersona(cuit)
  if (!result.ok) return NextResponse.json(result, { status: 422 })
  return NextResponse.json(result)
}
