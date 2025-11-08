export interface DiagnosticTest {
  name: string
  description: string
  config: {
    url: string
    method: "GET" | "POST" | "PUT" | "DELETE"
    headers?: Record<string, string>
    body?: any
  }
}

export interface DiagnosticResult {
  testName: string
  success: boolean
  status?: number
  statusText?: string
  response?: any
  error?: string
  duration: number
}

/**
 * Sistema de diagnóstico genérico para integraciones
 * Prueba diferentes configuraciones de autenticación para encontrar la correcta
 */
export async function runDiagnostics(tests: DiagnosticTest[]): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = []

  for (const test of tests) {
    const startTime = Date.now()

    try {
      console.log(`[v0] Ejecutando diagnóstico: ${test.name}`)

      const response = await fetch(test.config.url, {
        method: test.config.method,
        headers: test.config.headers,
        body: test.config.body ? JSON.stringify(test.config.body) : undefined,
      })

      const duration = Date.now() - startTime
      let responseData

      try {
        responseData = await response.json()
      } catch {
        responseData = await response.text()
      }

      results.push({
        testName: test.name,
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        response: responseData,
        duration,
      })

      console.log(`[v0] ${test.name}: ${response.status} ${response.statusText}`)
    } catch (error) {
      const duration = Date.now() - startTime
      results.push({
        testName: test.name,
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        duration,
      })
      console.error(`[v0] ${test.name} falló:`, error)
    }
  }

  return results
}

/**
 * Genera tests de diagnóstico comunes para APIs REST
 */
export function generateAuthDiagnostics(
  baseUrl: string,
  credentials: { username: string; password: string },
  dbParam?: string,
): DiagnosticTest[] {
  const url = dbParam ? `${baseUrl}?db=${dbParam}` : baseUrl

  return [
    {
      name: "Test 1: JSON con username/password (minúsculas)",
      description: "Formato estándar JSON con campos en minúsculas",
      config: {
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: {
          username: credentials.username,
          password: credentials.password,
        },
      },
    },
    {
      name: "Test 2: JSON con Username/Password (mayúscula inicial)",
      description: "Formato JSON con campos capitalizados (común en .NET)",
      config: {
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: {
          Username: credentials.username,
          Password: credentials.password,
        },
      },
    },
    {
      name: "Test 3: JSON con user/pass",
      description: "Formato JSON con nombres de campos alternativos",
      config: {
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: {
          user: credentials.username,
          pass: credentials.password,
        },
      },
    },
    {
      name: "Test 4: Form data",
      description: "Formato application/x-www-form-urlencoded",
      config: {
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: credentials.username,
          password: credentials.password,
        }).toString(),
      },
    },
  ]
}
