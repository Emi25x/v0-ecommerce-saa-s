import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { put } from "@vercel/blob"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 })

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Solo se permiten imágenes" }, { status: 400 })
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo no puede superar 2MB" }, { status: 400 })
    }

    const ext = file.name.split(".").pop() || "png"
    const blob = await put(`billing/logos/${user.id}.${ext}`, file, {
      access: "public",
      addRandomSuffix: false,
    })

    return NextResponse.json({ ok: true, url: blob.url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
