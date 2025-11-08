import { NextResponse } from "next/server"

// This endpoint has been moved to /api/ml/items
// Redirecting to new location
export async function GET() {
  return NextResponse.redirect(new URL("/api/ml/items", process.env.NEXT_PUBLIC_VERCEL_URL || "http://localhost:3000"))
}
