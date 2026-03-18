/**
 * Rate limiting para MercadoLibre API usando token bucket
 * Previene 429s coordinando requests entre múltiples procesos
 */

import { createClient } from '@/lib/supabase/server'

const WINDOW_DURATION_MS = 60000 // 1 minuto
const DEFAULT_LIMIT = 300 // requests por minuto

export interface RateLimitResult {
  allowed: boolean
  tokens_remaining: number
  reset_at: Date
  wait_ms?: number
}

/**
 * Adquiere tokens del bucket de rate limiting
 * 
 * @param account_id - ID de la cuenta ML
 * @param cost - Cantidad de tokens a consumir (default 1)
 * @returns Resultado indicando si se permite el request o cuánto esperar
 */
export async function acquireMlToken(
  account_id: string,
  cost: number = 1
): Promise<RateLimitResult> {
  const supabase = await createClient()
  const now = new Date()
  
  try {
    // Obtener o crear rate limit entry
    const { data: rateLimitData, error: fetchError } = await supabase
      .from('ml_rate_limits')
      .select('*')
      .eq('account_id', account_id)
      .maybeSingle()
    
    if (fetchError) {
      console.error('[RATE-LIMIT] Error fetching rate limit:', fetchError)
      // En caso de error, permitir (fail open)
      return {
        allowed: true,
        tokens_remaining: DEFAULT_LIMIT,
        reset_at: new Date(now.getTime() + WINDOW_DURATION_MS)
      }
    }
    
    // Si no existe, crear entry
    if (!rateLimitData) {
      const { error: createError } = await supabase
        .from('ml_rate_limits')
        .insert({
          account_id,
          window_start: now,
          tokens_used: cost,
          tokens_limit: DEFAULT_LIMIT,
          updated_at: now
        })
      
      if (createError) {
        console.error('[RATE-LIMIT] Error creating rate limit:', createError)
        return {
          allowed: true,
          tokens_remaining: DEFAULT_LIMIT - cost,
          reset_at: new Date(now.getTime() + WINDOW_DURATION_MS)
        }
      }
      
      return {
        allowed: true,
        tokens_remaining: DEFAULT_LIMIT - cost,
        reset_at: new Date(now.getTime() + WINDOW_DURATION_MS)
      }
    }
    
    // Verificar si la ventana expiró
    const windowStart = new Date(rateLimitData.window_start)
    const windowAge = now.getTime() - windowStart.getTime()
    
    if (windowAge >= WINDOW_DURATION_MS) {
      // Ventana expirada - resetear
      const { error: updateError } = await supabase
        .from('ml_rate_limits')
        .update({
          window_start: now,
          tokens_used: cost,
          updated_at: now
        })
        .eq('account_id', account_id)
      
      if (updateError) {
        console.error('[RATE-LIMIT] Error resetting window:', updateError)
      }
      
      return {
        allowed: true,
        tokens_remaining: rateLimitData.tokens_limit - cost,
        reset_at: new Date(now.getTime() + WINDOW_DURATION_MS)
      }
    }
    
    // Ventana activa - verificar límite
    const newTokensUsed = rateLimitData.tokens_used + cost
    
    if (newTokensUsed > rateLimitData.tokens_limit) {
      // Límite excedido
      const resetAt = new Date(windowStart.getTime() + WINDOW_DURATION_MS)
      const waitMs = resetAt.getTime() - now.getTime()
      
      console.warn(`[RATE-LIMIT] Limit exceeded for account ${account_id}: ${newTokensUsed}/${rateLimitData.tokens_limit}`)
      
      return {
        allowed: false,
        tokens_remaining: 0,
        reset_at: resetAt,
        wait_ms: waitMs
      }
    }
    
    // Límite OK - consumir tokens
    const { error: updateError } = await supabase
      .from('ml_rate_limits')
      .update({
        tokens_used: newTokensUsed,
        updated_at: now
      })
      .eq('account_id', account_id)
    
    if (updateError) {
      console.error('[RATE-LIMIT] Error updating tokens:', updateError)
    }
    
    return {
      allowed: true,
      tokens_remaining: rateLimitData.tokens_limit - newTokensUsed,
      reset_at: new Date(windowStart.getTime() + WINDOW_DURATION_MS)
    }
    
  } catch (error) {
    console.error('[RATE-LIMIT] Exception:', error)
    // En caso de excepción, permitir (fail open)
    return {
      allowed: true,
      tokens_remaining: DEFAULT_LIMIT,
      reset_at: new Date(now.getTime() + WINDOW_DURATION_MS)
    }
  }
}

/**
 * Espera hasta que haya tokens disponibles
 */
export async function waitForMlToken(account_id: string, cost: number = 1): Promise<void> {
  let attempts = 0
  const maxAttempts = 5
  
  while (attempts < maxAttempts) {
    const result = await acquireMlToken(account_id, cost)
    
    if (result.allowed) {
      return
    }
    
    if (result.wait_ms && result.wait_ms > 0) {
      const waitSeconds = Math.ceil(result.wait_ms / 1000)
      console.log(`[RATE-LIMIT] Waiting ${waitSeconds}s for tokens to refill...`)
      await new Promise(resolve => setTimeout(resolve, result.wait_ms))
    }
    
    attempts++
  }
  
  console.warn(`[RATE-LIMIT] Max wait attempts reached, proceeding anyway`)
}
