import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = createAdminClient()

  // Buscar Arnoia Stock source
  const { data: sources, error } = await supabase
    .from("import_sources")
    .select("id, name, is_active, url_template, credentials")
    .ilike("name", "%arnoia%")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stockSource = sources?.find(s => s.name?.toLowerCase().includes("stock"))
  const actSource = sources?.find(s => s.name?.toLowerCase().includes("act"))

  return NextResponse.json({
    all_arnoia_sources: sources?.map(s => ({
      id: s.id,
      name: s.name,
      is_active: s.is_active,
      has_url_template: !!s.url_template,
      has_credentials: !!s.credentials,
      credentials_keys: s.credentials ? Object.keys(s.credentials) : [],
    })),
    stock_source: stockSource ? {
      id: stockSource.id,
      name: stockSource.name,
      is_active: stockSource.is_active,
      url_configured: !!stockSource.url_template || !!(stockSource.credentials as any)?.url,
      credentials_url: (stockSource.credentials as any)?.url || null,
      url_template: stockSource.url_template || null,
    } : null,
    act_source: actSource ? {
      id: actSource.id,
      name: actSource.name,
      is_active: actSource.is_active,
    } : null,
    recommendation: !stockSource 
      ? "Stock source no existe o no está activa" 
      : !stockSource.is_active
      ? "Stock source está inactiva (is_active = false)"
      : !(stockSource.url_template || (stockSource.credentials as any)?.url)
      ? "Stock source NO tiene URL configurada - necesita credentials.url o url_template"
      : "Stock source está correctamente configurada",
  })
}
