import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { data: product, error } = await supabase
      .from("products")
      .update({
        sku: body.sku,
        title: body.title,
        description: body.description,
        price: body.price,
        stock: body.stock,
        image_url: body.image_url,
        category: body.category,
        brand: body.brand,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating product:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error("[v0] Error in PUT /api/inventory/products/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()

    const { error } = await supabase.from("products").delete().eq("id", id)

    if (error) {
      console.error("[v0] Error deleting product:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in DELETE /api/inventory/products/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
