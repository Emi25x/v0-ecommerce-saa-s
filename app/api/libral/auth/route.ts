import { type NextRequest, NextResponse } from "next/server"
import { authenticateLibral } from "@/lib/libral"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
    }

    console.log("[v0] Libral Auth - Starting authentication")

    const tokens = await authenticateLibral(username, password)

    console.log("[v0] Libral Auth - Token obtained, expires at:", tokens.expires_at)

    // Store token in Supabase
    const supabase = await createClient()

    const { data: existingAccount, error: fetchError } = await supabase
      .from("libral_accounts")
      .select("*")
      .eq("username", username)
      .single()

    if (existingAccount) {
      // Update existing account
      const { error: updateError } = await supabase
        .from("libral_accounts")
        .update({
          access_token: tokens.token,
          expires_at: tokens.expires_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAccount.id)

      if (updateError) {
        console.error("[v0] Libral Auth - Failed to update account:", updateError)
        throw updateError
      }

      console.log("[v0] Libral Auth - Account updated")
    } else {
      // Create new account
      const { error: insertError } = await supabase.from("libral_accounts").insert({
        username,
        access_token: tokens.token,
        expires_at: tokens.expires_at,
      })

      if (insertError) {
        console.error("[v0] Libral Auth - Failed to create account:", insertError)
        throw insertError
      }

      console.log("[v0] Libral Auth - Account created")
    }

    // Store token in secure cookie
    const response = NextResponse.json({
      success: true,
      message: "Authenticated with Libral successfully",
      expires_at: tokens.expires_at,
    })

    response.cookies.set("libral_access_token", tokens.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    })

    return response
  } catch (error) {
    console.error("[v0] Libral auth error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to authenticate with Libral", details: errorMessage }, { status: 500 })
  }
}

// Get current authentication status
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("libral_access_token")?.value

    if (!token) {
      return NextResponse.json({ authenticated: false })
    }

    const supabase = await createClient()

    const { data: account, error } = await supabase
      .from("libral_accounts")
      .select("*")
      .eq("access_token", token)
      .single()

    if (error || !account) {
      return NextResponse.json({ authenticated: false })
    }

    // Check if token is expired
    const expiresAt = new Date(account.expires_at)
    const now = new Date()

    if (expiresAt <= now) {
      return NextResponse.json({ authenticated: false, expired: true })
    }

    return NextResponse.json({
      authenticated: true,
      username: account.username,
      expires_at: account.expires_at,
    })
  } catch (error) {
    console.error("[v0] Libral auth status error:", error)
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
