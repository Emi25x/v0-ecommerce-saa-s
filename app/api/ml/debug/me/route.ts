import { NextRequest, NextResponse } from "next/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[ML-DEBUG-ME] Testing ML token for account ${accountId}`)

    // Get access token
    const accessToken = await getValidAccessToken(accountId)
    console.log(`[ML-DEBUG-ME] Got access token (length: ${accessToken.length})`)

    // Call ML /users/me to test token
    const meUrl = "https://api.mercadolibre.com/users/me"
    console.log(`[ML-DEBUG-ME] Calling ${meUrl}`)

    const response = await fetch(meUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    console.log(`[ML-DEBUG-ME] Response status: ${response.status}`)

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[ML-DEBUG-ME] Error - Status: ${response.status}, Body: ${errText}`)

      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          body: errText,
          message: "ML API returned error",
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    console.log(`[ML-DEBUG-ME] Success - User ID: ${data.id}, Nickname: ${data.nickname}`)

    return NextResponse.json({
      ok: true,
      user: data,
      message: "Token is valid",
    })
  } catch (error: any) {
    console.error("[ML-DEBUG-ME] Error:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
