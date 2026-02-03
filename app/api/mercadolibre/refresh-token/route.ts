import { createClient } from "@/lib/supabase"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = createClient()
    
    // Obtener la cuenta de ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .limit(1)
      .single()
    
    if (accountError || !account) {
      return NextResponse.json({ error: "No se encontró cuenta de ML" }, { status: 404 })
    }
    
    if (!account.refresh_token) {
      return NextResponse.json({ error: "No hay refresh_token guardado" }, { status: 400 })
    }
    
    console.log("[v0] Intentando refrescar token de ML...")
    
    // Llamar a la API de ML para refrescar el token
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.MERCADOLIBRE_CLIENT_ID!,
        client_secret: process.env.MERCADOLIBRE_CLIENT_SECRET!,
        refresh_token: account.refresh_token,
      }),
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error("[v0] Error de ML:", data)
      return NextResponse.json({ 
        error: "Error al refrescar token", 
        details: data,
        message: "Es posible que necesites reconectar la cuenta de ML"
      }, { status: 400 })
    }
    
    console.log("[v0] Token refrescado exitosamente")
    
    // Calcular fecha de expiración
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
    
    // Actualizar en la base de datos
    const { error: updateError } = await supabase
      .from("ml_accounts")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id)
    
    if (updateError) {
      return NextResponse.json({ error: "Error al guardar token", details: updateError }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Token refrescado exitosamente",
      expires_at: expiresAt
    })
    
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// GET para verificar estado del token
export async function GET() {
  try {
    const supabase = createClient()
    
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("nickname, token_expires_at, updated_at")
      .limit(1)
      .single()
    
    if (!account) {
      return NextResponse.json({ error: "No hay cuenta conectada" }, { status: 404 })
    }
    
    const expiresAt = new Date(account.token_expires_at)
    const now = new Date()
    const isExpired = expiresAt < now
    const hoursUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
    
    return NextResponse.json({
      account: account.nickname,
      expires_at: account.token_expires_at,
      is_expired: isExpired,
      hours_until_expiry: isExpired ? 0 : hoursUntilExpiry,
      last_updated: account.updated_at
    })
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
