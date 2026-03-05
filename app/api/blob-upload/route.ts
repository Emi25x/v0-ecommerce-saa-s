import { put } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/blob-upload?filename=catalogs/...
 * Proxy upload to Vercel Blob using streaming body.
 */
export async function POST(request: NextRequest) {
  try {
    const filename = request.nextUrl.searchParams.get("filename")
    if (!filename) return NextResponse.json({ error: "filename query param required" }, { status: 400 })

    const blob = await put(filename, request.body!, {
      access: "public",
      contentType: request.headers.get("content-type") ?? "application/octet-stream",
    })

    return NextResponse.json({ url: blob.url, pathname: blob.pathname })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
