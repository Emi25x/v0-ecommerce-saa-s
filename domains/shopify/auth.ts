// Funciones compartidas de autenticación con Shopify
// Importar desde aquí en todos los route handlers — NO importar desde otros routes.

export function normalizeDomain(shop_domain: string): string {
  const clean = shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return clean.includes(".") ? clean : `${clean}.myshopify.com`
}

/**
 * Intercambia client_id + client_secret por un access_token (shpat_...).
 *
 * Usa el flujo client_credentials (form-urlencoded) — exactamente como
 * se conectó la primera tienda. Si falla con 400, la causa más probable
 * es que la app necesita ser INSTALADA primero en Shopify Admin → Apps → tu app → Instalar.
 */
export async function exchangeCredentialsForToken(
  domain: string,
  api_key: string,
  api_secret: string
): Promise<string> {
  const url = `https://${domain}/admin/oauth/access_token`

  // Mismo formato que funcionó para la primera tienda
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: api_key,
      client_secret: api_secret,
    }).toString(),
  })

  const text = await res.text()

  if (res.ok) {
    try {
      const json = JSON.parse(text)
      if (json.access_token) return json.access_token as string
    } catch {}
    throw new Error("Shopify respondió OK pero no devolvió access_token")
  }

  let errDetail = `HTTP ${res.status}`
  try {
    const j = JSON.parse(text)
    errDetail = `HTTP ${res.status}: ${j.error_description ?? j.errors ?? j.error ?? text.slice(0, 200)}`
  } catch {
    errDetail = `HTTP ${res.status}: ${text.slice(0, 200)}`
  }

  // Mensaje claro según el tipo de error
  if (res.status === 400) {
    throw new Error(
      `${errDetail}. La app probablemente no está INSTALADA en esta tienda. ` +
      `Andá a Shopify → Configuración → Aplicaciones → Desarrollar apps → tu app → clickeá "Instalar". ` +
      `Después volvé acá e intentá de nuevo.`
    )
  }

  throw new Error(errDetail)
}

// Verifica el token llamando a shop.json
export async function fetchShopInfo(domain: string, access_token: string) {
  const res = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
    headers: { "X-Shopify-Access-Token": access_token, "Content-Type": "application/json" },
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = `HTTP ${res.status}: ${JSON.parse(text).errors ?? text.slice(0, 200)}` } catch {}
    throw new Error(msg)
  }
  return JSON.parse(text).shop ?? null
}

// Renueva el token y lo persiste en la DB. Devuelve el nuevo token.
export async function renewAndPersistToken(
  supabase: any,
  store: { id: string; shop_domain: string; api_key: string; api_secret: string }
): Promise<string> {
  const newToken = await exchangeCredentialsForToken(store.shop_domain, store.api_key, store.api_secret)
  const tokenExpiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString()
  await supabase
    .from("shopify_stores")
    .update({ access_token: newToken, token_expires_at: tokenExpiresAt })
    .eq("id", store.id)
  return newToken
}

// Devuelve un token válido, renovando automáticamente si expiró
export async function getValidToken(supabase: any, store: any): Promise<string> {
  if (!store.api_key || !store.api_secret) return store.access_token
  const expiresAt = store.token_expires_at ? new Date(store.token_expires_at) : new Date(0)
  if (expiresAt > new Date()) return store.access_token
  return renewAndPersistToken(supabase, store)
}
