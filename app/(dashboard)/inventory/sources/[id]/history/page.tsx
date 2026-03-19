"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Calendar, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { useParams } from "next/navigation"

interface ImportHistory {
  id: string
  source_id: string
  started_at: string
  completed_at: string | null
  status: string
  products_imported: number
  products_updated: number
  products_failed: number
  error_message: string | null
}

export default function ImportHistoryPage() {
  const params = useParams()
  const sourceId = params.id as string

  const [history, setHistory] = useState<ImportHistory[]>([])
  const [sourceName, setSourceName] = useState("")
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    loadHistory()
  }, [sourceId])

  async function loadHistory() {
    try {
      setLoading(true)

      // Cargar nombre de la fuente
      const { data: sourceData } = await supabase.from("import_sources").select("name").eq("id", sourceId).single()

      if (sourceData) {
        setSourceName(sourceData.name)
      }

      // Cargar historial
      const { data: historyData, error } = await supabase
        .from("import_history")
        .select("*")
        .eq("source_id", sourceId)
        .order("started_at", { ascending: false })

      if (error) throw error

      setHistory(historyData || [])
    } catch (error) {
      console.error("Error loading history:", error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />
      case "partial":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "success":
        return <Badge variant="default">Exitosa</Badge>
      case "error":
        return <Badge variant="destructive">Error</Badge>
      case "partial":
        return <Badge variant="secondary">Parcial</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando historial...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Historial de Importaciones</h1>
          <p className="text-muted-foreground mt-1">{sourceName}</p>
        </div>
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">No hay historial de importaciones para esta fuente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {history.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(item.status)}
                    <div>
                      <CardTitle className="text-lg">{new Date(item.started_at).toLocaleString()}</CardTitle>
                      <CardDescription>
                        {item.completed_at
                          ? `Duración: ${Math.round((new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) / 1000)}s`
                          : "En progreso"}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Importados</div>
                    <div className="text-2xl font-bold text-green-600">{item.products_imported}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Saltados</div>
                    <div className="text-2xl font-bold text-blue-600">{item.products_updated}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Errores</div>
                    <div className="text-2xl font-bold text-red-600">{item.products_failed}</div>
                  </div>
                </div>
                {item.error_message && (
                  <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                    <div className="text-sm font-medium text-destructive">Error:</div>
                    <div className="text-sm text-muted-foreground mt-1">{item.error_message}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
