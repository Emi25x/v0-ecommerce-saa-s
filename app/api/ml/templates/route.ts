import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get("account_id")

    const supabase = await createClient()

    let query = supabase
      .from("ml_publication_templates")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })

    if (accountId) {
      query = query.eq("account_id", accountId)
    }

    const { data: templates, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ templates })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      account_id,
      name,
      description,
      title_template,
      listing_type_id,
      condition,
      currency_id,
      price_formula,
      shipping_mode,
      free_shipping,
      local_pick_up,
      warranty,
      fixed_attributes,
      attribute_mapping,
      is_default,
    } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Si es default, quitar el default de otras plantillas
    if (is_default) {
      await supabase
        .from("ml_publication_templates")
        .update({ is_default: false })
        .eq("account_id", account_id)
    }

    const { data: template, error } = await supabase
      .from("ml_publication_templates")
      .insert({
        account_id,
        name: name || "Plantilla Principal",
        description,
        title_template,
        listing_type_id: listing_type_id || "gold_special",
        condition: condition || "new",
        currency_id: currency_id || "ARS",
        price_formula,
        shipping_mode: shipping_mode || "me2",
        free_shipping: free_shipping || false,
        local_pick_up: local_pick_up || false,
        warranty,
        fixed_attributes: fixed_attributes || [],
        attribute_mapping: attribute_mapping || {},
        is_default: is_default || false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, template })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Si es default, quitar el default de otras plantillas
    if (updateData.is_default) {
      const { data: existing } = await supabase
        .from("ml_publication_templates")
        .select("account_id")
        .eq("id", id)
        .single()

      if (existing) {
        await supabase
          .from("ml_publication_templates")
          .update({ is_default: false })
          .eq("account_id", existing.account_id)
      }
    }

    const { data: template, error } = await supabase
      .from("ml_publication_templates")
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, template })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from("ml_publication_templates")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
