import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkProducts() {
  console.log("[v0] Consultando productos en la base de datos...")

  // Contar total de productos
  const { count, error: countError } = await supabase.from("products").select("*", { count: "exact", head: true })

  if (countError) {
    console.error("[v0] Error al contar productos:", countError)
    return
  }

  console.log(`[v0] Total de productos en la base de datos: ${count}`)

  // Obtener algunos productos de ejemplo
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("sku, title, internal_code, price, stock, created_at")
    .limit(5)
    .order("created_at", { ascending: false })

  if (productsError) {
    console.error("[v0] Error al obtener productos:", productsError)
    return
  }

  if (products && products.length > 0) {
    console.log("[v0] Últimos 5 productos:")
    products.forEach((p, i) => {
      console.log(
        `  ${i + 1}. SKU: ${p.sku}, Título: ${p.title}, Código: ${p.internal_code}, Precio: ${p.price}, Stock: ${p.stock}`,
      )
    })
  } else {
    console.log("[v0] No hay productos en la base de datos")
  }
}

checkProducts()
