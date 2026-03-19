import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { createAdminClient } from "@/lib/db/admin"

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  const supabase = createAdminClient()

  const { data: source } = await supabase
    .from("import_sources")
    .select("url_template, credentials, auth_type")
    .ilike("name", "%azeta%total%")
    .single()

  if (!source) return NextResponse.json({ error: "AZETA source not found" }, { status: 404 })

  const creds = source.credentials as any
  const url = source.url_template || creds?.url || ""

  const results: any[] = []

  // Probar GET
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120" },
      signal: AbortSignal.timeout(10000),
    })
    const body = await r.text()
    results.push({
      method: "GET",
      status: r.status,
      contentType: r.headers.get("content-type"),
      bodyPreview: body.substring(0, 200),
    })
  } catch (e: any) {
    results.push({ method: "GET", error: e.message })
  }

  // Probar POST con form data
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
      signal: AbortSignal.timeout(10000),
    })
    const body = await r.text()
    results.push({
      method: "POST",
      status: r.status,
      contentType: r.headers.get("content-type"),
      bodyPreview: body.substring(0, 200),
    })
  } catch (e: any) {
    results.push({ method: "POST", error: e.message })
  }

  // Probar HEAD
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "curl/7.88.1" },
      signal: AbortSignal.timeout(10000),
    })
    results.push({
      method: "HEAD",
      status: r.status,
      contentType: r.headers.get("content-type"),
      contentLength: r.headers.get("content-length"),
    })
  } catch (e: any) {
    results.push({ method: "HEAD", error: e.message })
  }

  return NextResponse.json({ url, results })
}
