import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

const DB_NAME = "GN6LIBRAL"

export async function GET() {
  try {
    const supabase = await createClient()

    // Get credentials
    const { data: config } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("integration_name", "Libral")
      .single()

    if (!config?.config) {
      return NextResponse.json({ error: "No Libral config found" }, { status: 404 })
    }

    const { username, password } = config.config

    const domains = [
      { name: "abazal", url: "https://libral.core.abazal.com/api" },
      { name: "core", url: "https://libral.core.com/api" },
    ]

    const allResults = []

    for (const domain of domains) {
      // First, authenticate
      const authResponse = await fetch(`${domain.url}/auth/login?db=${DB_NAME}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Username: username, Password: password }),
      })

      if (!authResponse.ok) {
        allResults.push({
          domain: domain.name,
          test: "Authentication",
          status: authResponse.status,
          success: false,
          error: "Authentication failed",
        })
        continue
      }

      const { token } = await authResponse.json()

      const tests = [
        {
          name: "POST /libroes/LibrosLIBRAL - Simple body",
          url: `${domain.url}/libroes/LibrosLIBRAL?db=${DB_NAME}`,
          method: "POST",
          body: { take: 1 },
        },
        {
          name: "POST /libroes/LibrosLIBRAL - With select (string format)",
          url: `${domain.url}/libroes/LibrosLIBRAL?db=${DB_NAME}`,
          method: "POST",
          body: { take: 1, select: "['ean','titulo']" },
        },
        {
          name: "POST /libroes/LibrosLIBRAL - With select (array format)",
          url: `${domain.url}/libroes/LibrosLIBRAL?db=${DB_NAME}`,
          method: "POST",
          body: { take: 1, select: ["ean", "titulo"] },
        },
        {
          name: "GET /libroes/LibrosLIBRAL - Query params",
          url: `${domain.url}/libroes/LibrosLIBRAL?db=${DB_NAME}&take=1`,
          method: "GET",
          body: null,
        },
        {
          name: "POST /libros/LibrosLIBRAL - Simple body",
          url: `${domain.url}/libros/LibrosLIBRAL?db=${DB_NAME}`,
          method: "POST",
          body: { take: 1 },
        },
        {
          name: "GET /libros/LibrosLIBRAL - Query params",
          url: `${domain.url}/libros/LibrosLIBRAL?db=${DB_NAME}&take=1`,
          method: "GET",
          body: null,
        },
      ]

      for (const test of tests) {
        try {
          const response = await fetch(test.url, {
            method: test.method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: test.body ? JSON.stringify(test.body) : undefined,
          })

          const responseText = await response.text()
          let responseData
          try {
            responseData = JSON.parse(responseText)
          } catch {
            responseData = responseText.substring(0, 200) // Limit response size
          }

          allResults.push({
            domain: domain.name,
            test: test.name,
            url: test.url,
            method: test.method,
            status: response.status,
            statusText: response.statusText,
            success: response.ok,
            response: responseData,
          })
        } catch (error: any) {
          allResults.push({
            domain: domain.name,
            test: test.name,
            error: error.message,
            success: false,
          })
        }
      }
    }

    return NextResponse.json({ results: allResults })
  } catch (error: any) {
    console.error("[v0] Libral diagnosis error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
