import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  console.log("[v0] ========== TEST ENDPOINT LLAMADO ==========")
  console.log("[v0] Timestamp:", new Date().toISOString())
  console.log("[v0] Este es un log de prueba")

  return NextResponse.json({
    success: true,
    message: "Test endpoint funcionando",
    timestamp: new Date().toISOString(),
  })
}
