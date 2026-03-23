/**
 * @internal Diagnostic endpoint — Product count and duplicate diagnostics.
 * Used by: hooks/use-import-sources.ts
 * Protected by requireUser() — only authenticated users can access.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 10

export async function GET() {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {
    const supabase = createAdminClient()

    const { count } = await supabase.from("products").select("*", { count: "exact", head: true })

    return NextResponse.json({
      totalProducts: count || 0,
      totalDuplicateSKUs: 0,
      message: "Para análisis completo de duplicados, usa los scripts SQL en Supabase",
      useSqlScripts: true,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        totalProducts: 0,
        totalDuplicateSKUs: 0,
        error: error.message,
        useSqlScripts: true,
      },
      { status: 200 },
    )
  }
}
