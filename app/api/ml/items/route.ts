import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

// Cache en memoria simple (dura mientras el servidor esté activo)
let itemsCache: {
  data: any
  timestamp: number
  key: string
} | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos de cache

// Helper para fetch con reintentos
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000), // 15 segundos timeout
      })
      return response
    } catch (error) {
      lastError = error as Error
      console.log(`[v0] Fetch attempt ${i + 1} failed:`, lastError.message)
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))) // Espera exponencial
      }
    }
  }
  throw lastError || new Error("Fetch failed after retries")
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limit = Number.parseInt(searchParams.get("limit") || "50")
  const offset = Number.parseInt(searchParams.get("offset") || "0")
  const accountId = searchParams.get("account_id")
  const status = searchParams.get("status")
  const catalogListing = searchParams.get("catalog_listing")
  const listingType = searchParams.get("listing_type")
  const tags = searchParams.get("tags")
  const subStatus = searchParams.get("sub_status")
  const sort = searchParams.get("sort") || "sold_quantity_desc"
  const noCache = searchParams.get("no_cache") === "true"
  const healthFilter = searchParams.get("health_filter")

  // Generar clave de cache única
  const cacheKey = `${limit}-${offset}-${accountId}-${status}-${sort}`

  // Verificar cache (solo para consultas básicas sin forzar refresh)
  if (!noCache && itemsCache && itemsCache.key === cacheKey && Date.now() - itemsCache.timestamp < CACHE_TTL) {
    console.log("[v0] Returning cached items data")
    return NextResponse.json(itemsCache.data)
  }

  try {
    const supabase = await createClient()
    let accountsQuery = supabase.from("ml_accounts").select("*")

    if (accountId && accountId !== "all") {
      accountsQuery = accountsQuery.eq("id", accountId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error("[v0] Error fetching accounts:", accountsError)
      return NextResponse.json({ error: accountsError.message }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      console.log("[v0] No accounts found")
      return NextResponse.json({ products: [], paging: { total: 0, limit, offset } })
    }

    console.log(`[v0] Found ${accounts.length} account(s)`)
    let account = accounts[0]

    // Verificar si el token está expirado y refrescarlo automáticamente
    const expiresAt = new Date(account.token_expires_at)
    const now = new Date()
    if (expiresAt < now && account.refresh_token) {
      console.log("[v0] Token expirado, intentando refrescar...")
      try {
        const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: process.env.MERCADOLIBRE_CLIENT_ID!,
            client_secret: process.env.MERCADOLIBRE_CLIENT_SECRET!,
            refresh_token: account.refresh_token,
          }),
        })

        if (refreshResponse.ok) {
          const tokens = await refreshResponse.json()
          const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

          await supabase
            .from("ml_accounts")
            .update({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              token_expires_at: newExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", account.id)

          account = { ...account, access_token: tokens.access_token }
          console.log("[v0] Token refrescado exitosamente")
        } else {
          console.error("[v0] Error al refrescar token:", await refreshResponse.text())
        }
      } catch (refreshError) {
        console.error("[v0] Error en refresh:", refreshError)
      }
    }

    const accessToken = account.access_token

    if (!accessToken) {
      console.error("[v0] No access token available for account:", account.id)
      return NextResponse.json({ error: "No access token available" }, { status: 401 })
    }

    // Si hay health_filter, consultar desde BD en lugar de API de ML
    if (healthFilter && healthFilter !== "all") {
      console.log("[v0] Using database query for health filter:", healthFilter)

      let dbQuery = supabase
        .from("ml_publications")
        .select("*")
        .eq("account_id", account.id)
        .range(offset, offset + limit - 1)

      if (healthFilter === "para_ganar_competencia") {
        dbQuery = dbQuery.eq("is_competing", true)
      } else if (healthFilter === "elegibles_para_competir") {
        dbQuery = dbQuery.eq("catalog_listing_eligible", true)
      }

      const { data: publications, error: dbError } = await dbQuery

      if (dbError) {
        console.error("[v0] DB query error:", dbError)
        return NextResponse.json({ error: "Database query failed" }, { status: 500 })
      }

      // Contar total para paginación
      let countQuery = supabase
        .from("ml_publications")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)

      if (healthFilter === "para_ganar_competencia") {
        countQuery = countQuery.eq("is_competing", true)
      } else if (healthFilter === "elegibles_para_competir") {
        countQuery = countQuery.eq("catalog_listing_eligible", true)
      }

      const { count } = await countQuery

      const formattedProducts =
        publications?.map((pub: any) => ({
          id: pub.ml_item_id,
          title: pub.title,
          price: pub.price,
          available_quantity: pub.current_stock,
          status: pub.status,
          permalink: pub.permalink,
          catalog_listing: pub.catalog_listing_eligible,
          thumbnail: null,
          account_id: pub.account_id,
          account_nickname: account.nickname,
        })) || []

      return NextResponse.json({
        products: formattedProducts,
        paging: { total: count || 0, limit, offset },
      })
    }

    let searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=${limit}&offset=${offset}`

    if (status && status !== "all") searchUrl += `&status=${status}`
    if (catalogListing === "true") searchUrl += `&catalog_listing=true`
    if (catalogListing === "false") searchUrl += `&catalog_listing=false`
    if (listingType && listingType !== "all") searchUrl += `&listing_type=${listingType}`
    if (tags && tags !== "all") searchUrl += `&tags=${tags}`
    if (subStatus && subStatus !== "all") searchUrl += `&sub_status=${subStatus}`

    console.log("[v0] Fetching products from ML API:", searchUrl)

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error("[v0] ML API error:", searchResponse.status, errorText)

      // Si es rate limit, devolver error claro
      if (searchResponse.status === 429 || errorText.includes("Too Many Requests")) {
        return NextResponse.json(
          {
            error: "Límite de API excedido. Intenta en unos minutos.",
            rate_limited: true,
          },
          { status: 429 },
        )
      }

      return NextResponse.json({ error: "Failed to fetch from MercadoLibre" }, { status: searchResponse.status })
    }

    const searchData = await searchResponse.json()
    const itemIds = searchData.results || []

    console.log("[v0] ML Search Response - total:", searchData.paging?.total, "results:", itemIds.length)
    console.log("[v0] Found", itemIds.length, "product IDs")

    // Actualizar el total de publicaciones en ML automáticamente
    if (searchData.paging?.total && accountId) {
      await supabase.from("ml_accounts").update({ total_ml_publications: searchData.paging.total }).eq("id", accountId)
      console.log("[v0] Updated total_ml_publications to:", searchData.paging.total)
    }

    if (itemIds.length === 0) {
      console.log("[v0] No products found, returning empty array")
      return NextResponse.json({
        products: [],
        paging: searchData.paging || { total: 0, limit, offset },
      })
    }

    const chunkSize = 20
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      chunks.push(itemIds.slice(i, i + chunkSize))
    }

    console.log("[v0] Processing", chunks.length, "chunks of products")

    let allProducts: any[] = []

    for (const chunk of chunks) {
      const itemsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}`
      console.log("[v0] Fetching chunk:", itemsUrl)

      const itemsResponse = await fetch(itemsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!itemsResponse.ok) {
        console.error("[v0] Failed to fetch items chunk:", itemsResponse.status)
        continue
      }

      const itemsData = await itemsResponse.json()
      const products = itemsData.map((item: any) => item.body).filter(Boolean)

      console.log("[v0] Received", products.length, "products in chunk")

      const productsWithAccount = products.map((product: any) => ({
        ...product,
        account_id: account.id,
        account_nickname: account.nickname,
      }))

      // Guardar productos en ml_publications en background (sin esperar)
      Promise.all(
        products.map(async (product: any) => {
          try {
            // Buscar SKU/GTIN en attributes
            let sku = product.seller_custom_field || ""
            if (!sku && product.attributes) {
              const isbnAttr = product.attributes.find(
                (attr: any) => attr.id === "ISBN" || attr.id === "GTIN" || attr.id === "EAN",
              )
              if (isbnAttr) sku = isbnAttr.value_name || ""
            }

            // Buscar product_id por SKU
            let product_id = null
            if (sku) {
              const { data: productMatch } = await supabase.from("products").select("id").eq("ean", sku).maybeSingle()
              product_id = productMatch?.id || null
            }

            // Verificar si existe
            const { data: existing } = await supabase
              .from("ml_publications")
              .select("id, health_checked_at")
              .eq("ml_item_id", product.id)
              .maybeSingle()

            const pubData: any = {
              account_id: account.id,
              ml_item_id: product.id,
              product_id,
              title: product.title,
              price: product.price,
              current_stock: product.available_quantity,
              status: product.status,
              permalink: product.permalink,
              updated_at: new Date().toISOString(),
            }

            // Consultar elegibilidad de catálogo y competencia (max 1 vez por día por publicación)
            const shouldCheckHealth =
              !existing ||
              !existing.health_checked_at ||
              new Date(existing.health_checked_at).getTime() < Date.now() - 24 * 60 * 60 * 1000

            if (shouldCheckHealth && product.catalog_listing === true) {
              try {
                // Verificar elegibilidad para competir
                const eligibilityResponse = await fetch(
                  `https://api.mercadolibre.com/items/${product.id}/catalog_listing_eligibility`,
                  { headers: { Authorization: `Bearer ${account.access_token}` } },
                )
                if (eligibilityResponse.ok) {
                  const eligibility = await eligibilityResponse.json()
                  pubData.catalog_listing_eligible = eligibility.eligible === true
                }

                // Verificar si está compitiendo
                const priceResponse = await fetch(`https://api.mercadolibre.com/items/${product.id}/price_to_win`, {
                  headers: { Authorization: `Bearer ${account.access_token}` },
                })
                if (priceResponse.ok) {
                  const priceData = await priceResponse.json()
                  pubData.is_competing = priceData.is_winning === false
                  pubData.price_to_win = priceData.price_to_win?.amount || null
                }

                pubData.health_checked_at = new Date().toISOString()
              } catch (healthErr) {
                console.error("[v0] Error checking health for", product.id, healthErr)
              }
            }

            if (existing) {
              await supabase.from("ml_publications").update(pubData).eq("id", existing.id)
            } else {
              await supabase.from("ml_publications").insert(pubData)
            }
          } catch (err) {
            // Silenciar errores para no romper la consulta principal
            console.error("[v0] Error guardando publicación:", err)
          }
        }),
      ).catch(() => {}) // Ignorar errores en background

      allProducts = allProducts.concat(productsWithAccount)
      console.log("[v0] Total products so far:", allProducts.length)
    }

    const sortedProducts = [...allProducts].sort((a, b) => {
      switch (sort) {
        case "sold_quantity_desc":
          return (b.sold_quantity || 0) - (a.sold_quantity || 0)
        case "sold_quantity_asc":
          return (a.sold_quantity || 0) - (b.sold_quantity || 0)
        case "price_desc":
          return (b.price || 0) - (a.price || 0)
        case "price_asc":
          return (a.price || 0) - (b.price || 0)
        case "date_desc":
          return new Date(b.date_created || 0).getTime() - new Date(a.date_created || 0).getTime()
        case "date_asc":
          return new Date(a.date_created || 0).getTime() - new Date(b.date_created || 0).getTime()
        default:
          return 0
      }
    })

    const responseData = {
      products: sortedProducts,
      paging: searchData.paging || { total: allProducts.length, limit, offset },
    }

    // Guardar en cache
    itemsCache = {
      data: responseData,
      timestamp: Date.now(),
      key: cacheKey,
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error("[v0] ❌❌❌ CRITICAL ERROR in GET /api/ml/items:", error)
    console.error("[v0] Error type:", error instanceof Error ? error.constructor.name : typeof error)
    console.error("[v0] Error message:", error instanceof Error ? error.message : String(error))
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")
    console.error("[v0] ========================================")

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
