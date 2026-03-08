import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * POST /api/debug/force-matcher
 * Dispara el matcher manualmente y devuelve diagnóstico
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { account_id } = body

  if (!account_id) {
    return NextResponse.json({ error: "missing account_id" }, { status: 400 })
  }

  const supabase = await createClient({ useServiceRole: true })

  try {
    console.log("[v0] force-matcher: iniciando para account_id:", account_id)

    // 1. Verificar qué hay en ML publications
    const { count: totalPubs } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)

    const { count: unlinkedPubs } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)
      .is("product_id", null)

    console.log("[v0] force-matcher: Total pubs:", totalPubs, "Unlinked:", unlinkedPubs)

    // 2. Disparar matcher DIRECTAMENTE
    const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000"

    const matcherUrl = `${baseUrl}/api/ml/matcher/run`
    
    console.log("[v0] force-matcher: Calling matcher at:", matcherUrl)

    const matcherResponse = await fetch(matcherUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_id,
        max_seconds: 50,
        batch_size: 300,
      }),
    })

    const matcherResult = await matcherResponse.json()
    
    console.log("[v0] force-matcher: Matcher response:", matcherResult)

    if (!matcherResponse.ok) {
      return NextResponse.json({
        error: "Matcher failed",
        matcher_status: matcherResponse.status,
        matcher_result: matcherResult,
      }, { status: 500 })
    }

    // 3. Verificar post-matcher
    const { count: linkedAfter } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)
      .not("product_id", "is", null)

    const { data: sample } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, product_id, sku, ean")
      .eq("account_id", account_id)
      .limit(5)

    return NextResponse.json({
      success: true,
      before: {
        unlinked: unlinkedPubs,
        total: totalPubs,
      },
      after: {
        linked: linkedAfter,
        unlinked: (totalPubs || 0) - (linkedAfter || 0),
      },
      matcher_output: matcherResult,
      sample_publications: sample,
    })
  } catch (error: any) {
    console.error("[v0] force-matcher error:", error)
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
    }, { status: 500 })
  }
}
