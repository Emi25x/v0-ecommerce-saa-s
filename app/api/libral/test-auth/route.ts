import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json()

    const url = "https://libral.core.abazal.com/api/auth/login?db=GN6LIBRAL"

    console.log("[v0] Libral Test Auth - Testing with username:", username)
    console.log("[v0] Libral Test Auth - Password length:", password.length)

    console.log("[v0] Test: Request with lowercase fields (username/password)")
    const test = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ username, password }),
    })

    const testResult = {
      status: test.status,
      headers: Object.fromEntries(test.headers.entries()),
      body: await test.text(),
    }
    console.log("[v0] Test result:", testResult)

    return NextResponse.json({
      test: testResult,
      success: test.ok,
    })
  } catch (error: any) {
    console.error("[v0] Libral Test Auth - Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
