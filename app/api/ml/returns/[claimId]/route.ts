import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: credentials, error: credError } = await supabase
      .from("mercadolibre_credentials")
      .select("access_token")
      .eq("user_id", user.id)
      .single()

    if (credError || !credentials) {
      return NextResponse.json({ error: "MercadoLibre not connected" }, { status: 400 })
    }

    const response = await fetch(`https://api.mercadolibre.com/post-purchase/v2/claims/${claimId}/returns`, {
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      return NextResponse.json({ error: errorData }, { status: response.status })
    }

    const returnData = await response.json()
    return NextResponse.json(returnData)
  } catch (error) {
    console.error("Error fetching return details:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
