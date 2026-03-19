/**
 * Funciones compartidas de optin al catálogo ML.
 * Usadas por: catalog-optin/bulk/run, catalog-migration/migrate/run, publish
 */

/**
 * Normaliza un EAN que puede venir en notación científica (ej: 9.78845E+12).
 */
export function normalizeEanForCatalog(raw: string): string {
  let ean = String(raw).trim()
  if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(ean)) {
    ean = Number(ean).toFixed(0)
  }
  return ean
}

/**
 * Resuelve un EAN/ISBN/GTIN contra la ML Products API para obtener el catalog_product_id.
 * Devuelve null si no hay match.
 */
export async function resolveCatalogProductId(params: {
  ean: string
  accessToken: string
  siteId?: string
  timeoutMs?: number
}): Promise<string | null> {
  const { ean, accessToken, siteId = "MLA", timeoutMs = 8000 } = params

  const searchUrl = `https://api.mercadolibre.com/products/search?status=active&site_id=${siteId}&product_identifier=${encodeURIComponent(ean)}`

  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    })

    if (!res.ok) return null

    const data = await res.json()
    const results: any[] = data.results ?? []
    return results.length > 0 ? results[0].id : null
  } catch {
    return null
  } finally {
    clearTimeout(tid)
  }
}

export interface OptinResult {
  ok: boolean
  data?: any
  error?: string
  status?: number
}

/**
 * Ejecuta optin de un item ML al catálogo.
 * POST /items/catalog_listings con item_id + catalog_product_id.
 */
export async function optinItemToCatalog(params: {
  itemId: string
  catalogProductId: string
  accessToken: string
}): Promise<OptinResult> {
  const { itemId, catalogProductId, accessToken } = params

  try {
    const res = await fetch("https://api.mercadolibre.com/items/catalog_listings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item_id: itemId,
        catalog_product_id: catalogProductId,
      }),
    })

    const body = await res.json().catch(() => ({}))

    if (res.ok) {
      return { ok: true, data: body }
    }
    return {
      ok: false,
      status: res.status,
      error: JSON.stringify(body).slice(0, 400),
    }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
