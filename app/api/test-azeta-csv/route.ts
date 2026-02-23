import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // URL correcta con credenciales
  const baseUrl = "https://www.azetadistribuciones.es/servicios_web/azeta_catalogo_notexto_csv.csv.zip"
  const user = "680899"
  const password = "badajoz24"
  const url = `${baseUrl}?user=${user}&password=${password}`
  
  console.log("[v0] Fetching AZETA file from:", baseUrl)
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      console.log("[v0] Response not OK:", response.status, response.statusText)
      return NextResponse.json({ 
        error: `HTTP ${response.status}: ${response.statusText}` 
      }, { status: 500 })
    }
    
    const buffer = Buffer.from(await response.arrayBuffer())
    console.log("[v0] Downloaded:", buffer.length, "bytes")
    
    // Mostrar primeros bytes
    const firstBytes = buffer.slice(0, 20).toString('hex')
    const firstChars = buffer.slice(0, 50).toString('utf-8', 0, 50).replace(/[^\x20-\x7E]/g, '.')
    
    return NextResponse.json({
      contentType: response.headers.get('content-type'),
      size: buffer.length,
      firstBytes,
      firstChars,
      isPK: buffer[0] === 0x50 && buffer[1] === 0x4B,
      message: buffer[0] === 0x50 && buffer[1] === 0x4B ? 
        "✅ Es archivo ZIP - necesita extracción" : 
        "📄 Es CSV directo - no necesita extracción"
    })
  } catch (error: any) {
    console.error("[v0] Fetch error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
