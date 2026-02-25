import { NextResponse } from "next/server"
import { put, del, list } from "@vercel/blob"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-download" })
}

export async function POST() {
  const startTime = Date.now()
  const url = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

  try {
    console.log("[AZETA-DL] Descargando ZIP desde AZETA...")
    const res = await fetch(url, { method: "GET" })
    console.log(`[AZETA-DL] status=${res.status} content-type=${res.headers.get("content-type")} content-length=${res.headers.get("content-length")}`)

    if (!res.ok) {
      const preview = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      return NextResponse.json({ error: `Error ${res.status} servidor AZETA`, preview }, { status: 502 })
    }

    // Borrar blobs anteriores de azeta para no acumular
    try {
      const { blobs } = await list({ prefix: "azeta-catalog/" })
      for (const b of blobs) await del(b.url)
      console.log(`[AZETA-DL] Borrados ${blobs.length} blobs anteriores`)
    } catch (e) {
      console.log("[AZETA-DL] No habia blobs anteriores")
    }

    // Subir ZIP directamente a Vercel Blob (sin cargar en memoria)
    const blob = await put("azeta-catalog/catalog.zip", res.body!, {
      access: "public",
      contentType: res.headers.get("content-type") || "application/zip",
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-DL] ZIP subido a Blob: ${blob.url} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      blob_url: blob.url,
      elapsed_seconds: parseFloat(elapsed),
    })
  } catch (err: any) {
    console.error("[AZETA-DL] Error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
