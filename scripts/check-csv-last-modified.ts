import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkCSVLastModified() {
  console.log("[v0] 🔍 Verificando última actualización de archivos CSV...\n")

  // Obtener todas las fuentes activas
  const { data: sources, error } = await supabase
    .from("inventory_sources")
    .select("*")
    .eq("is_active", true)
    .order("name")

  if (error) {
    console.error("[v0] ❌ Error al obtener fuentes:", error)
    return
  }

  if (!sources || sources.length === 0) {
    console.log("[v0] ⚠️  No hay fuentes activas configuradas")
    return
  }

  console.log(`[v0] 📋 Encontradas ${sources.length} fuentes activas:\n`)

  for (const source of sources) {
    console.log(`[v0] 📁 Fuente: ${source.name}`)
    console.log(`[v0]    URL: ${source.csv_url}`)
    console.log(`[v0]    Tipo: ${source.source_type}`)

    try {
      // Hacer una petición HEAD para obtener los headers sin descargar el archivo
      const response = await fetch(source.csv_url, {
        method: "HEAD",
      })

      if (!response.ok) {
        console.log(`[v0]    ❌ Error HTTP: ${response.status} ${response.statusText}`)
        console.log("")
        continue
      }

      // Obtener el header Last-Modified
      const lastModified = response.headers.get("last-modified")
      const contentLength = response.headers.get("content-length")
      const contentType = response.headers.get("content-type")

      if (lastModified) {
        const date = new Date(lastModified)
        console.log(`[v0]    ✅ Última modificación: ${date.toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`)
        console.log(`[v0]    📅 Fecha: ${date.toLocaleDateString("es-ES")}`)
        console.log(`[v0]    🕐 Hora: ${date.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid" })}`)
      } else {
        console.log(`[v0]    ⚠️  No se pudo obtener la fecha de última modificación`)
      }

      if (contentLength) {
        const sizeMB = (Number.parseInt(contentLength) / 1024 / 1024).toFixed(2)
        console.log(`[v0]    📦 Tamaño: ${sizeMB} MB`)
      }

      if (contentType) {
        console.log(`[v0]    📄 Tipo: ${contentType}`)
      }

      console.log("")
    } catch (error) {
      console.error(`[v0]    ❌ Error al verificar archivo:`, error)
      console.log("")
    }
  }

  console.log("[v0] ✅ Verificación completada")
}

checkCSVLastModified()
