import { NextRequest, NextResponse } from "next/server"
import { consultarPadron }          from "@/lib/arca/padron"

export async function GET(req: NextRequest) {
  const cuit = req.nextUrl.searchParams.get("cuit")?.replace(/\D/g, "")
  if (!cuit || (cuit.length !== 11 && cuit.length !== 8 && cuit.length !== 7)) {
    return NextResponse.json({ error: "Ingresá un CUIT (11 dígitos) o DNI (7-8 dígitos) válido" }, { status: 400 })
  }
  try {
    const persona = await consultarPadron(cuit)
    return NextResponse.json({ ok: true, persona })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error consultando el padrón" }, { status: 500 })
  }
}
