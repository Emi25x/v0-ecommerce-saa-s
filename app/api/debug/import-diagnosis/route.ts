import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/debug/import-diagnosis
 * Diagnóstico completo del sistema de importación de ML
 * Busca la cuenta del usuario, obtiene datos de ML, y verifica todo
 */
export async function GET(request: Request) {
  console.log("[DEBUG DIAGNOSIS] ========== ML IMPORT FULL DIAGNOSIS ==========")
  
  try {
    const { searchParams } = new URL(request.url)
    const account_id = searchParams.get("account_id")

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient()
    const diagnosis: any = {
      timestamp: new Date().toISOString(),
      account_id,
      checks: {}
    }

    // 1. Verificar que la cuenta existe
    console.log("[DEBUG] Step 1: Fetching account...")
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .maybeSingle()

    diagnosis.checks.account_exists = !accountError && !!account
    diagnosis.checks.account_error = accountError?.message

    if (!account) {
      diagnosis.error = "Account not found"
      return NextResponse.json(diagnosis, { status: 404 })
    }

    diagnosis.account = {
      id: account.id,
      nickname: account.nickname,
      ml_user_id: account.ml_user_id,
      total_ml_publications: account.total_ml_publications,
      access_token_preview: account.access_token ? account.access_token.substring(0, 20) + "..." : null,
      token_expires_at: account.token_expires_at,
      token_valid_now: new Date(account.token_expires_at) > new Date(),
    }

    // 2. Verificar que hay un job activo (o crear uno)
    console.log("[DEBUG] Step 2: Checking for active import job...")
    const { data: activeJob } = await supabase
      .from("ml_import_jobs")
      .select("*")
      .eq("account_id", account_id)
      .in("status", ["pending", "indexing", "processing"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    diagnosis.checks.active_job_exists = !!activeJob
    if (activeJob) {
      diagnosis.active_job = {
        id: activeJob.id,
        status: activeJob.status,
        total_items: activeJob.total_items,
        current_offset: activeJob.current_offset,
        processed_items: activeJob.processed_items,
        failed_items: activeJob.failed_items,
        started_at: activeJob.started_at,
      }
    }

    // 3. Verificar acceso a ML API llamando directamente
    console.log("[DEBUG] Step 3: Testing ML API access...")
    try {
      const testUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=1&offset=0`
      console.log("[DEBUG] Calling:", testUrl)

      const mlResponse = await fetch(testUrl, {
        headers: { Authorization: `Bearer ${account.access_token}` }
      })

      diagnosis.checks.ml_api_accessible = mlResponse.ok
      diagnosis.checks.ml_api_status = mlResponse.status

      if (mlResponse.ok) {
        const mlData = await mlResponse.json()
        diagnosis.ml_api_response = {
          status: mlResponse.status,
          paging: mlData.paging,
          results_count: mlData.results?.length || 0,
        }
      } else {
        const errorText = await mlResponse.text()
        diagnosis.ml_api_response = {
          status: mlResponse.status,
          error: errorText.substring(0, 200),
        }
      }
    } catch (mlError: any) {
      diagnosis.checks.ml_api_accessible = false
      diagnosis.ml_api_response = { error: mlError.message }
    }

    // 4. Si no hay total_ml_publications, intentar obtenerlo de ML
    console.log("[DEBUG] Step 4: Checking total_ml_publications...")
    if (!account.total_ml_publications || account.total_ml_publications === 0) {
      try {
        const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=1&offset=0`
        const searchResponse = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${account.access_token}` }
        })

        if (searchResponse.ok) {
          const searchData = await searchResponse.json()
          const totalFromML = searchData.paging?.total || 0
          diagnosis.checks.total_from_ml = totalFromML

          if (totalFromML > 0) {
            // Update account con el total correcto
            await supabase
              .from("ml_accounts")
              .update({ total_ml_publications: totalFromML })
              .eq("id", account_id)
            
            diagnosis.checks.updated_total_ml_publications = totalFromML
          }
        }
      } catch (err) {
        diagnosis.checks.error_fetching_total = (err as Error).message
      }
    }

    // 5. Contar items en queue
    console.log("[DEBUG] Step 5: Checking import queue...")
    if (activeJob) {
      const { count: pendingCount } = await supabase
        .from("ml_import_queue")
        .select("id", { count: "exact", head: true })
        .eq("job_id", activeJob.id)
        .eq("status", "pending")

      const { count: completedCount } = await supabase
        .from("ml_import_queue")
        .select("id", { count: "exact", head: true })
        .eq("job_id", activeJob.id)
        .eq("status", "completed")

      diagnosis.checks.queue_stats = {
        pending: pendingCount || 0,
        completed: completedCount || 0,
      }
    }

    console.log("[DEBUG DIAGNOSIS] Complete diagnosis:", JSON.stringify(diagnosis, null, 2))

    return NextResponse.json({
      ok: true,
      diagnosis
    })

  } catch (error: any) {
    console.error("[DEBUG DIAGNOSIS] Error:", error)
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}
