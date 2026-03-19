import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { requireCron } from "@/lib/auth/require-auth"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  const { id } = await params
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.from("import_history").select("*").eq("id", id).single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
