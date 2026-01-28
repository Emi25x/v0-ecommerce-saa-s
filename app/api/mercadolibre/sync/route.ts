import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

const ML_API_BASE = "https://api.mercadolibre.com"

// Sincroniza órdenes, productos y preguntas de una cuenta de MercadoLibre
export async function POST(request: NextRequest) {
  try {
    const { accountId, ml_user_id } = await request.json()
    
    if (!accountId && !ml_user_id) {
      return NextResponse.json({ error: "accountId o ml_user_id es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Obtener la cuenta de ML por id o ml_user_id
    let query = supabase.from("ml_accounts").select("*")
    
    if (accountId) {
      query = query.eq("id", accountId)
    } else if (ml_user_id) {
      query = query.eq("ml_user_id", ml_user_id.toString())
    }
    
    const { data: account, error: accountError } = await query.single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Refrescar token si es necesario
    const validAccount = await refreshTokenIfNeeded(account)
    const accessToken = validAccount.access_token

    const results = {
      orders: { synced: 0, errors: 0 },
      items: { synced: 0, errors: 0 },
      questions: { synced: 0, errors: 0 },
    }

    // 1. Sincronizar órdenes recientes (últimos 30 días)
    try {
      const ordersResponse = await fetch(
        `${ML_API_BASE}/orders/search?seller=${account.ml_user_id}&sort=date_desc&limit=50`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )

      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json()
        
        for (const order of ordersData.results || []) {
          const { error } = await supabase
            .from("ml_orders_cache")
            .upsert({
              id: order.id.toString(),
              account_id: accountId,
              order_data: order,
              status: order.status,
              total_amount: order.total_amount,
              buyer_nickname: order.buyer?.nickname,
              cached_at: new Date().toISOString(),
            }, { onConflict: "id" })

          if (error) {
            results.orders.errors++
          } else {
            results.orders.synced++
          }
        }
      }
    } catch (e) {
      console.error("[v0] Error syncing orders:", e)
    }

    // 2. Sincronizar items/publicaciones activas
    try {
      const itemsResponse = await fetch(
        `${ML_API_BASE}/users/${account.ml_user_id}/items/search?status=active&limit=100`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )

      if (itemsResponse.ok) {
        const itemsData = await itemsResponse.json()
        const itemIds = itemsData.results || []

        // Obtener detalles de cada item (en batches de 20)
        for (let i = 0; i < itemIds.length; i += 20) {
          const batch = itemIds.slice(i, i + 20)
          const multiGetResponse = await fetch(
            `${ML_API_BASE}/items?ids=${batch.join(",")}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          )

          if (multiGetResponse.ok) {
            const itemsDetails = await multiGetResponse.json()

            for (const itemWrapper of itemsDetails) {
              if (itemWrapper.code === 200 && itemWrapper.body) {
                const item = itemWrapper.body
                const { error } = await supabase
                  .from("ml_products_cache")
                  .upsert({
                    id: item.id,
                    account_id: accountId,
                    title: item.title,
                    price: item.price,
                    currency_id: item.currency_id,
                    available_quantity: item.available_quantity,
                    sold_quantity: item.sold_quantity,
                    status: item.status,
                    thumbnail: item.thumbnail,
                    permalink: item.permalink,
                    category_id: item.category_id,
                    item_data: item,
                    cached_at: new Date().toISOString(),
                  }, { onConflict: "id" })

                if (error) {
                  results.items.errors++
                } else {
                  results.items.synced++
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[v0] Error syncing items:", e)
    }

    // 3. Sincronizar preguntas sin responder
    try {
      const questionsResponse = await fetch(
        `${ML_API_BASE}/questions/search?seller_id=${account.ml_user_id}&status=UNANSWERED&limit=50`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )

      if (questionsResponse.ok) {
        const questionsData = await questionsResponse.json()

        for (const question of questionsData.questions || []) {
          const { error } = await supabase
            .from("ml_questions_cache")
            .upsert({
              id: question.id.toString(),
              account_id: accountId,
              item_id: question.item_id,
              question_text: question.text,
              status: question.status,
              from_user_id: question.from?.id?.toString(),
              question_data: question,
              cached_at: new Date().toISOString(),
            }, { onConflict: "id" })

          if (error) {
            results.questions.errors++
          } else {
            results.questions.synced++
          }
        }
      }
    } catch (e) {
      console.error("[v0] Error syncing questions:", e)
    }

    // Actualizar última sincronización en la cuenta
    await supabase
      .from("ml_accounts")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", accountId)

    return NextResponse.json({
      success: true,
      results,
      message: `Sincronización completada: ${results.orders.synced} órdenes, ${results.items.synced} productos, ${results.questions.synced} preguntas`,
    })

  } catch (error) {
    console.error("[v0] Sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error de sincronización" },
      { status: 500 }
    )
  }
}

// GET para sincronizar todas las cuentas (para cron jobs)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: accounts } = await supabase
      .from("ml_accounts")
      .select("id")
      .gt("token_expires_at", new Date().toISOString())

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No hay cuentas activas para sincronizar" })
    }

    const results = []
    for (const account of accounts) {
      const response = await fetch(`${request.nextUrl.origin}/api/mercadolibre/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      })
      const result = await response.json()
      results.push({ accountId: account.id, ...result })
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error("[v0] Sync all error:", error)
    return NextResponse.json({ error: "Error en sincronización global" }, { status: 500 })
  }
}
