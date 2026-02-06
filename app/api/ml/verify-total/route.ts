import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createClient()
    
    console.log("[v0] Verificando total real de publicaciones en ML...")
    
    // Obtener cuenta
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .single()
    
    if (!account) {
      return NextResponse.json({ error: "No se encontró cuenta" }, { status: 404 })
    }
    
    // Consultar API de ML para obtener el TOTAL real usando search
    const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active`
    
    console.log("[v0] Consultando ML API:", searchUrl)
    
    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${account.access_token}`
      }
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error("[v0] Error consultando ML:", response.status, error)
      return NextResponse.json({ 
        error: `Error ML API: ${response.status}`,
        details: error
      }, { status: response.status })
    }
    
    const data = await response.json()
    
    console.log("[v0] Respuesta de ML:", {
      paging: data.paging,
      results: data.results?.length || 0
    })
    
    const totalInML = data.paging?.total || 0
    
    // Actualizar en la BD
    await supabase
      .from("ml_accounts")
      .update({ total_ml_publications: totalInML })
      .eq("id", account.id)
    
    console.log("[v0] Total real en ML:", totalInML)
    
    return NextResponse.json({
      success: true,
      total_in_ml: totalInML,
      account: account.nickname,
      user_id: account.ml_user_id
    })
    
  } catch (error) {
    console.error("[v0] Error verificando total:", error)
    return NextResponse.json({ 
      error: "Error interno", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 })
  }
}
