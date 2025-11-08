import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function verifyProducts() {
  console.log("🔍 Verificando productos en la base de datos...\n")

  // Contar total de productos
  const { count: totalCount, error: countError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })

  if (countError) {
    console.error("❌ Error al contar productos:", countError)
    return
  }

  console.log(`📊 Total de productos en la base de datos: ${totalCount || 0}\n`)

  if (totalCount && totalCount > 0) {
    // Obtener los últimos 10 productos
    const { data: recentProducts, error: recentError } = await supabase
      .from("products")
      .select("sku, title, internal_code, price, stock, source, created_at")
      .order("created_at", { ascending: false })
      .limit(10)

    if (recentError) {
      console.error("❌ Error al obtener productos recientes:", recentError)
    } else {
      console.log("📦 Últimos 10 productos creados:")
      recentProducts?.forEach((p, i) => {
        console.log(`\n${i + 1}. SKU: ${p.sku}`)
        console.log(`   Título: ${p.title}`)
        console.log(`   Código Interno: ${p.internal_code}`)
        console.log(`   Precio: ${p.price}`)
        console.log(`   Stock: ${p.stock}`)
        console.log(`   Fuente: ${p.source}`)
        console.log(`   Creado: ${new Date(p.created_at).toLocaleString()}`)
      })
    }

    // Contar por fuente
    const { data: sourceStats, error: sourceError } = await supabase.from("products").select("source")

    if (!sourceError && sourceStats) {
      const sourceCounts = sourceStats.reduce(
        (acc, p) => {
          const source = p.source || "sin fuente"
          acc[source] = (acc[source] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      console.log("\n\n📈 Productos por fuente:")
      Object.entries(sourceCounts).forEach(([source, count]) => {
        console.log(`   ${source}: ${count} productos`)
      })
    }
  } else {
    console.log("⚠️  No hay productos en la base de datos")
  }
}

verifyProducts()
