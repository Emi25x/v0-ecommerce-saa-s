import { type NextRequest, NextResponse } from "next/server"
import { generateAuthDiagnostics, runDiagnostics } from "@/domains/integrations/diagnostics"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { integration, credentials, config } = body

    if (!integration || !credentials) {
      return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 })
    }

    let tests

    // Generar tests según la integración
    switch (integration) {
      case "libral":
        tests = generateAuthDiagnostics(
          config?.url || "https://libral.core.abazal.com/api/auth/login",
          credentials,
          config?.db || "LIBRAL",
        )
        break

      // Agregar más integraciones aquí en el futuro
      default:
        return NextResponse.json({ error: "Integración no soportada" }, { status: 400 })
    }

    const results = await runDiagnostics(tests)

    return NextResponse.json({ results })
  } catch (error) {
    console.error("[v0] Error en diagnósticos:", error)
    return NextResponse.json({ error: "Error ejecutando diagnósticos" }, { status: 500 })
  }
}
