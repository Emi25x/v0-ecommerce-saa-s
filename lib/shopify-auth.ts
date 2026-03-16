// Funciones compartidas de autenticación con Shopify
// Importar desde aquí en todos los route handlers — NO importar desde otros routes.

export function normalizeDomain(shop_domain: string): string {
  const clean = shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return clean.includes(".") ? clean : `${clean}.myshopify.com`
}

/**
 * Intercambia client_id + client_secret por un access_token (shpat_...).
 *
 * Intenta múltiples formatos que Shopify acepta según el tipo de app:
 * 1. JSON sin grant_type (custom apps creadas en admin panel)
 * 2. JSON con grant_type=client_credentials (custom apps vía Partners)
 * 3. form-urlencoded (legacy)
 *
 * Si todos fallan con 400, es probable que la app necesite instalarse
 * primero vía OAuth redirect (authorization code flow).
 */
export async function exchangeCredentialsForToken(
  domain: string,
  api_key: string,
  api_secret: string
): Promise<string> {
  const url = `https://${domain}/admin/oauth/access_token`

  // Intento 1: JSON sin grant_type (formato más común para custom apps)
  const attempts = [
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: api_key, client_secret: api_secret }),
    },
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: api_key, client_secret: api_secret, grant_type: "client_credentials" }),
    },
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: api_key, client_secret: api_secret }).toString(),
    },
  ]

  let lastError = ""

  for (const attempt of attempts) {
    const res = await fetch(url, {
      method: "POST",
      headers: attempt.headers,
      body: attempt.body,
    })

    const text = await res.text()

    if (res.ok) {
      try {
        const json = JSON.parse(text)
        if (json.access_token) return json.access_token as string
      } catch {}
    }

    // 401 means wrong credentials — don't retry
    if (res.status === 401) {
      try {
        const j = JSON.parse(text)
        lastError = `Credenciales inválidas: ${j.error_description ?? j.errors ?? text}`
      } catch {
        lastError = `Credenciales inválidas (HTTP 401)`
      }
      break
    }

    // 400 could mean wrong format or app not installed — try next
    try {
      const j = JSON.parse(text)
      lastError = `HTTP ${res.status}: ${j.error_description ?? j.errors ?? j.error ?? text.slice(0, 200)}`
    } catch {
      lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`
    }
  }

  throw new Error(
    `${lastError}. ` +
    `Si la app no está instalada en esta tienda, usá el flujo OAuth (Conectar via OAuth) ` +
    `o copiá el Access Token desde Shopify → Configuración → Aplicaciones → tu app → Credenciales de API.`
  )
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
