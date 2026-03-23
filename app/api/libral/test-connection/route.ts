import { NextResponse } from "next/server"
import { getLibralToken } from "@/domains/suppliers/libral/client"
import { requireUser } from "@/lib/auth/require-auth"

async function testLibralConnection(token: string) {
  const testConfigs = [
    {
      name: "Con Auth + db=GN6LIBRAL",
      baseUrl: "https://libral.core.com/api",
      db: "GN6LIBRAL",
      body: { take: 1, select: "['ean','titulo']" },
      useAuth: true,
    },
    {
      name: "Con Auth + db=LIBRAL",
      baseUrl: "https://libral.core.com/api",
      db: "LIBRAL",
      body: { take: 1, select: "['ean','titulo']" },
      useAuth: true,
    },
    {
      name: "Sin Auth + db=GN6LIBRAL",
      baseUrl: "https://libral.core.com/api",
      db: "GN6LIBRAL",
      body: { take: 1, select: "['ean','titulo']" },
      useAuth: false,
    },
    {
      name: "Sin Auth + db=LIBRAL",
      baseUrl: "https://libral.core.com/api",
      db: "LIBRAL",
      body: { take: 1, select: "['ean','titulo']" },
      useAuth: false,
    },
    {
      name: "Token en body + db=GN6LIBRAL",
      baseUrl: "https://libral.core.com/api",
      db: "GN6LIBRAL",
      body: { take: 1, select: "['ean','titulo']", token },
      useAuth: false,
    },
  ]

  const results = []

  for (const config of testConfigs) {
    try {
      console.log(`[v0] Testing ${config.name}`)

      const url = `${config.baseUrl}/libroes/LibrosLIBRAL?db=${config.db}`

      console.log(`[v0] Request URL:`, url)
      console.log(`[v0] Request body:`, JSON.stringify(config.body))
      console.log(`[v0] Using Authorization header:`, config.useAuth)

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }

      if (config.useAuth) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(config.body),
      })

      console.log(`[v0] Response status: ${response.status}`)
      console.log(`[v0] Response content-type:`, response.headers.get("content-type"))

      const responseText = await response.text()
      console.log(`[v0] Response body (first 200 chars):`, responseText.substring(0, 200))

      if (response.ok) {
        try {
          const data = JSON.parse(responseText)
          console.log(`[v0] ✓ ${config.name} FUNCIONA!`)
          results.push({
            config: config.name,
            success: true,
            status: response.status,
            data,
          })
        } catch (parseError) {
          console.log(`[v0] ✗ ${config.name} - 200 OK pero respuesta no es JSON válido`)
          results.push({
            config: config.name,
            success: false,
            status: response.status,
            error: `Response is not valid JSON: ${responseText.substring(0, 100)}`,
          })
        }
      } else {
        console.log(`[v0] ✗ ${config.name} falló: ${response.status}`)
        results.push({
          config: config.name,
          success: false,
          status: response.status,
          error: responseText || `HTTP ${response.status}`,
        })
      }
    } catch (error) {
      console.error(`[v0] ✗ ${config.name} error:`, error)
      results.push({
        config: config.name,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return results
}

export async function GET() {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {

    const token = await getLibralToken()
    const results = await testLibralConnection(token)

    const successfulConfig = results.find((r) => r.success)

    if (successfulConfig) {
      console.log("[v0] Libral connection successful with:", successfulConfig.config)
      return NextResponse.json({
        connected: true,
        message: `Successfully connected to Libral ERP using ${successfulConfig.config}`,
        workingConfig: successfulConfig.config,
        totalProducts: successfulConfig.data?.totalCount || -1,
        allResults: results,
      })
    } else {
      console.error("[v0] All configurations failed")
      return NextResponse.json(
        {
          connected: false,
          error: "All connection attempts failed. Check logs for details.",
          allResults: results,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("[v0] Libral connection test failed:", error)
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Failed to connect to Libral",
      },
      { status: 500 },
    )
  }
}
