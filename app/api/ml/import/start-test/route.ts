import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import/start-test
 * Endpoint de diagnóstico - SIN dependencias de Supabase
 */
export async function POST(request: Request) {
  console.log("[v0] ========== START-TEST CALLED ==========")
  
  try {
    const body = await request.json()
    console.log("[v0] Body received:", body)
    
    return NextResponse.json({
      success: true,
      message: "Test endpoint funciona correctamente",
      received: body,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error("[v0] Error in start-test:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  console.log("[v0] ========== START-TEST GET CALLED ==========")
  return NextResponse.json({ ok: true, message: "Test endpoint GET works" })
}
