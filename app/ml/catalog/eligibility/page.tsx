"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2 } from "lucide-react"

export default function MLCatalogEligibilityPage() {
  const [indexing, setIndexing] = useState(false)
  const [result, setResult]     = useState<string | null>(null)

  const handleIndex = async () => {
    setIndexing(true)
    setResult(null)
    try {
      const res  = await fetch("/api/ml/catalog/eligibility/index", { method: "POST" })
      const data = await res.json()
      setResult(data.ok ? `Indexado: ${data.count ?? 0} publicaciones elegibles marcadas.` : (data.error ?? "Error desconocido"))
    } catch (e: any) {
      setResult(`Error: ${e.message}`)
    } finally {
      setIndexing(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Elegibilidad para Catálogo</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Identifica tus publicaciones que son elegibles para optar por el catálogo de MercadoLibre.
        </p>
      </div>

      <div className="border rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-green-500/10 p-3 shrink-0">
            <CheckCircle2 className="h-6 w-6 text-green-400" />
          </div>
          <div>
            <h2 className="font-semibold">¿Qué son las publicaciones elegibles?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Son publicaciones activas que ML identificó como candidatas para competir dentro del catálogo.
              Al hacer opt-in, tu publicación compite directamente en el listing del catálogo con mejor posicionamiento.
            </p>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            El botón "Indexar elegibles" marca en la base de datos local qué publicaciones tienen{" "}
            <code className="text-xs bg-muted px-1 rounded">catalog_listing_eligible = true</code> consultando la API de ML.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={handleIndex} disabled={indexing}>
              {indexing
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Indexando...</>
                : "Indexar elegibles"}
            </Button>
            <p className="text-xs text-muted-foreground">
              El endpoint <code className="bg-muted px-1 rounded">/api/ml/catalog/eligibility/index</code> debe estar implementado.
            </p>
          </div>
          {result && (
            <p className={`text-sm rounded-md px-3 py-2 border ${result.startsWith("Error") ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-green-500/10 border-green-500/20 text-green-400"}`}>
              {result}
            </p>
          )}
        </div>
      </div>

      <div className="border rounded-xl p-5 bg-muted/10 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Flujo recomendado</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Importá tus publicaciones desde <a href="/ml/importer" className="underline">Importación inicial</a></li>
          <li>Corré "Indexar elegibles" para marcar las candidatas</li>
          <li>Revisá las elegibles en <a href="/ml/publications" className="underline">Publicaciones</a> (filtro "Solo elegibles catálogo")</li>
          <li>Hacé opt-in desde <a href="/ml/catalog/optin" className="underline">Opt-in / Crear catálogo</a></li>
        </ol>
      </div>
    </div>
  )
}
