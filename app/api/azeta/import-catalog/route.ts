import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeEan } from "@/lib/ean-utils"

export const maxDuration = 300

// Vercel Cron invoca con GET
export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(_request: NextRequest) {
  // Delegar al endpoint directo que maneja ZIP correctamente
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000"

  const res = await fetch(`${baseUrl}/api/azeta/import-catalog-direct`, { method: "POST" })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
