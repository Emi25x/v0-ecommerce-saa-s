import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const url = "https://www.azetaeditorial.com/php/azeta_catalogo_notexto_csv.csv.zip"
  
  try {
    const response = await fetch(url)
    const buffer = Buffer.from(await response.arrayBuffer())
    
    // Mostrar primeros bytes
    const firstBytes = buffer.slice(0, 20).toString('hex')
    const firstChars = buffer.slice(0, 50).toString('utf-8', 0, 50).replace(/[^\x20-\x7E]/g, '.')
    
    return NextResponse.json({
      contentType: response.headers.get('content-type'),
      size: buffer.length,
      firstBytes,
      firstChars,
      isPK: buffer[0] === 0x50 && buffer[1] === 0x4B,
      message: "Si isPK=true, el archivo es ZIP y necesita extracción. Si isPK=false, es CSV directo."
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
