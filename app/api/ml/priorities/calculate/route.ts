import { NextResponse } from "next/server"
import { calculateMlPriorities } from "@/lib/ml/calculate-priorities"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const result = await calculateMlPriorities({
      ml_account_id: body.ml_account_id ?? null,
    })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
