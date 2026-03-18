/**
 * HTTP Client robusto para MercadoLibre API
 * Maneja rate limits, retries, y errores de parsing JSON
 */

export interface MlFetchOptions {
  accessToken: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  headers?: Record<string, string>
}

export interface MlFetchContext {
  account_id: string
  op_name: string
}

export interface MlFetchError {
  ok: false
  status: number
  statusText: string
  body_text: string
  url: string
  op_name: string
  account_id: string
  retries: number
}

const MAX_RETRIES = 6
const BASE_BACKOFF_MS = 1000

/**
 * Calcula backoff exponencial con jitter
 */
function calculateBackoff(attempt: number, retryAfter?: number): number {
  if (retryAfter) {
    return retryAfter * 1000
  }
  
  const exponential = BASE_BACKOFF_MS * Math.pow(2, attempt)
  const jitter = Math.random() * 0.3 * exponential // 30% jitter
  return Math.min(exponential + jitter, 60000) // max 60s
}

/**
 * Fetch robusto a MercadoLibre con retry automático
 * 
 * NO asume JSON - lee response.text() primero y parsea solo si es válido
 * Maneja 429/5xx con retry exponencial + jitter
 */
export async function mlFetchJson<T = any>(
  url: string,
  options: MlFetchOptions,
  context: MlFetchContext
): Promise<T | MlFetchError> {
  const { accessToken, method = 'GET', body, headers = {} } = options
  const { account_id, op_name } = context
  
  let lastError: MlFetchError | null = null
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[ML-HTTP] ${op_name} - attempt ${attempt + 1}/${MAX_RETRIES + 1} - ${method} ${url.substring(0, 100)}`)
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000), // 15s timeout
      })
      
      // Leer respuesta como texto SIEMPRE
      const responseText = await response.text()
      
      // Si es exitoso, intentar parsear JSON
      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        
        // Intentar parsear JSON si tiene content-type correcto o si parece JSON
        if (contentType.includes('application/json') || responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
          try {
            const data = JSON.parse(responseText)
            console.log(`[ML-HTTP] ${op_name} - SUCCESS - ${response.status}`)
            return data as T
          } catch (parseError) {
            console.error(`[ML-HTTP] ${op_name} - JSON parse error despite 200 OK:`, parseError)
            // Devolver texto raw si no se puede parsear
            return responseText as any
          }
        }
        
        // Si no es JSON, devolver texto
        return responseText as any
      }
      
      // Manejar errores HTTP
      lastError = {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        body_text: responseText.substring(0, 1000), // truncate a 1000 chars
        url: url.replace(accessToken, '***'), // ocultar token
        op_name,
        account_id,
        retries: attempt,
      }
      
      // Rate limit (429) - usar Retry-After si existe
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '0')
        const backoffMs = calculateBackoff(attempt, retryAfter)
        
        console.warn(`[ML-HTTP] ${op_name} - RATE LIMITED (429) - retry after ${Math.round(backoffMs / 1000)}s`)
        
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          continue
        }
      }
      
      // Server errors (5xx) - retry con backoff
      if (response.status >= 500 && response.status < 600) {
        const backoffMs = calculateBackoff(attempt)
        
        console.warn(`[ML-HTTP] ${op_name} - SERVER ERROR (${response.status}) - retry after ${Math.round(backoffMs / 1000)}s`)
        
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          continue
        }
      }
      
      // Otros errores (4xx) - no reintentar
      console.error(`[ML-HTTP] ${op_name} - CLIENT ERROR (${response.status}) - not retrying`)
      break
      
    } catch (error: any) {
      console.error(`[ML-HTTP] ${op_name} - EXCEPTION:`, error.message)
      
      lastError = {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        body_text: error.message,
        url: url.replace(accessToken, '***'),
        op_name,
        account_id,
        retries: attempt,
      }
      
      // Retry en caso de timeout/network error
      if (attempt < MAX_RETRIES) {
        const backoffMs = calculateBackoff(attempt)
        console.warn(`[ML-HTTP] ${op_name} - network error, retry after ${Math.round(backoffMs / 1000)}s`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }
    }
  }
  
  // Todos los reintentos fallaron
  console.error(`[ML-HTTP] ${op_name} - ALL RETRIES FAILED`, lastError)
  return lastError!
}

/**
 * Type guard para verificar si el resultado es un error
 */
export function isMlFetchError(result: any): result is MlFetchError {
  return result && typeof result === 'object' && result.ok === false && 'status' in result
}
