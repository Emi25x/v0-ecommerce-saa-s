import { createClient } from "@/lib/supabase/server"
import { executeSyncStockBatch } from "@/lib/ml/sync-stock-logic"
import { getBestIdentifier } from "@/lib/ml/product-identifier-extractor"
import { NextResponse } from "next/server"
import { startRun } from "@/lib/process-runs"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutos

export async function GET(request: Request) {
  try {
    // En Vercel, los crons están protegidos por defecto
    const authHeader = request.headers.get("authorization")
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Solo verificar si CRON_SECRET está configurado
      const isVercelCron = request.headers.get("x-vercel-cron") === "true"
      if (!isVercelCron && process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const supabase = await createClient()

    // Obtener todas las cuentas ML con auto_sync_stock habilitado
    const { data: accounts, error: accountsError } = await supabase
      .from("ml_accounts")
      .select("id, nickname, access_token, ml_user_id, auto_sync_stock")
      .eq("auto_sync_stock", true)

    if (accountsError) {
      console.error("Error fetching ML accounts:", accountsError)
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No accounts with auto_sync_stock enabled" })
    }

    const run = await startRun(supabase, "ml_sync_stock", "ML Sync Stock (cron)")
    const results = []
    let totalLinked = 0, totalProcessed = 0, totalErrors = 0

    for (const account of accounts) {
      try {
        // 1. Primero vincular publicaciones sin product_id
        const linkResult = await linkPublicationsToProducts(supabase, account)
        
        // 2. Luego sincronizar stock (llamada directa, sin self-fetch)
        const syncResult = await executeSyncStockBatch(supabase, {
          account_id: account.id,
          limit: 200,
        })
        
        totalLinked += syncResult.linked ?? 0
        totalProcessed += syncResult.processed ?? 0
        totalErrors += syncResult.errors ?? 0

        results.push({
          account: account.nickname,
          linked: linkResult,
          sync: syncResult
        })
      } catch (error) {
        totalErrors++
        console.error(`Error processing account ${account.nickname}:`, error)
        results.push({
          account: account.nickname,
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }
    }

    await run.complete({
      rows_processed: totalProcessed,
      rows_updated: totalLinked,
      rows_failed: totalErrors,
      log_json: { accounts_count: accounts.length, results },
    })

    return NextResponse.json({
      success: true,
      processed: accounts.length,
      results
    })

  } catch (error) {
    console.error("Error in sync-ml-stock cron:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// Función para vincular publicaciones con productos por EAN
async function linkPublicationsToProducts(
  supabase: any,
  account: { id: string; nickname: string; access_token: string; ml_user_id: string }
) {
  // Obtener publicaciones sin product_id
  const { data: unlinkedPubs, error: pubsError } = await supabase
    .from("ml_publications")
    .select("id, ml_item_id")
    .eq("account_id", account.id)
    .is("product_id", null)
    .limit(100) // Procesar en lotes

  if (pubsError || !unlinkedPubs || unlinkedPubs.length === 0) {
    return { unlinked: 0, linked: 0, errors: 0 }
  }

  let linked = 0
  let errors = 0

  // Procesar en lotes de 20 (límite de ML API)
  for (let i = 0; i < unlinkedPubs.length; i += 20) {
    const batch = unlinkedPubs.slice(i, i + 20)
    const itemIds = batch.map((p: any) => p.ml_item_id).join(",")

    try {
      // Obtener detalles de ML
      const response = await fetch(
        `https://api.mercadolibre.com/items?ids=${itemIds}&attributes=id,seller_sku,seller_custom_field,attributes`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      )

      if (!response.ok) continue

      const items = await response.json()

      for (const itemWrapper of items) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) continue

        const item = itemWrapper.body
        const pub = batch.find((p: any) => p.ml_item_id === item.id)
        if (!pub) continue

        // Extraer EAN usando extractor compartido
        const ean = getBestIdentifier(item)
        if (!ean) continue

        // Buscar producto por EAN
        const { data: product } = await supabase
          .from("products")
          .select("id")
          .eq("ean", ean)
          .maybeSingle()

        if (product) {
          // Vincular publicación con producto
          const { error: updateError } = await supabase
            .from("ml_publications")
            .update({ product_id: product.id })
            .eq("id", pub.id)

          if (!updateError) {
            linked++
          } else {
            errors++
          }
        }
      }

      // Delay entre lotes
      await new Promise(resolve => setTimeout(resolve, 200))

    } catch (error) {
      console.error("Error processing batch:", error)
      errors++
    }
  }

  return {
    unlinked: unlinkedPubs.length,
    linked,
    errors
  }
}
