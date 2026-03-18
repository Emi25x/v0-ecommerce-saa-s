import { type NextRequest, NextResponse } from "next/server"
import { isLibralTokenValid } from "@/domains/suppliers/libral/client"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("libral_access_token")?.value

    if (!token) {
      return NextResponse.json({
        connected: false,
        message: "Not authenticated with Libral",
      })
    }

    const supabase = await createClient()

    const { data: account, error } = await supabase
      .from("libral_accounts")
      .select("*")
      .eq("access_token", token)
      .single()

    if (error || !account) {
      return NextResponse.json({
        connected: false,
        message: "Account not found",
      })
    }

    const isValid = isLibralTokenValid(account.expires_at)

    return NextResponse.json({
      connected: isValid,
      username: account.username,
      expires_at: account.expires_at,
      expired: !isValid,
    })
  } catch (error) {
    console.error("[v0] Libral status error:", error)
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
