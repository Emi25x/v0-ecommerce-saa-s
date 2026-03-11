"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  FileText, 
  Database, 
  Settings, 
  History, 
  Play, 
  CheckCircle2, 
  XCircle,
  Link as LinkIcon,
  Shield,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { isCustomField, customFieldKey } from "@/lib/column-mapping-helpers"

export default function SourceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sourceId = params.id as string
  
  const [source, setSource] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    fetchSourceDetails()
  }, [sourceId])

  const fetchSourceDetails = async () => {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(sourceId)) {
      console.log("[v0] Invalid UUID format, skipping fetch:", sourceId)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      
      // Fetch source details
      const { data: sourceData, error: sourceError } = await supabase
        .from("import_sources")
        .select("*")
        .eq("id", sourceId)
        .single()

      if (sourceError) throw sourceError

      setSource(sourceData)

      // Fetch import statistics
      const { data: historyData, error: historyError } = await supabase
        .from("import_history")
        .select("*")
        .eq("source_id", sourceId)
        .order("started_at", { ascending: false })
        .limit(1)

      if (!historyError && historyData && historyData.length > 0) {
        setStats(historyData[0])
      }
    } catch (error) {
      console.error("Error fetching source details:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!source) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Fuente no encontrada</CardTitle>
            <CardDescription>La fuente de importación solicitada no existe.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/inventory/sources")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Fuentes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/inventory/sources")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{source.name}</h1>
            <p className="text-muted-foreground">{source.description || "Sin descripción"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={source.is_active ? "default" : "secondary"}>
            {source.is_active ? "Activa" : "Inactiva"}
          </Badge>
          <Button variant="outline" asChild>
            <Link href={`/inventory/sources/${sourceId}/history`}>
              <History className="mr-2 h-4 w-4" />
              Historial
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/inventory/sources/new?edit=${sourceId}`}>
              <Settings className="mr-2 h-4 w-4" />
              Configurar
            </Link>
          </Button>
        </div>
      </div>

      {/* Source Information */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Tipo de Feed</p>
                <p className="text-sm text-muted-foreground capitalize">{source.feed_type || "catalog"}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-start gap-3">
              <LinkIcon className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">URL Template</p>
                <p className="text-sm text-muted-foreground break-all">{source.url_template}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Autenticación</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {source.auth_type === "none" ? "Sin autenticación" : source.auth_type}
                </p>
              </div>
            </div>
            <Separator />
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Creada</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(source.created_at).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Última Importación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats ? (
              <>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Fecha</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(stats.started_at).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start gap-3">
                  {stats.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 mt-0.5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 mt-0.5 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Estado</p>
                    <p className="text-sm text-muted-foreground capitalize">{stats.status}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Productos Procesados</p>
                    <p className="text-sm text-muted-foreground">
                      {stats.total_processed || 0} total
                      {stats.created_count > 0 && ` • ${stats.created_count} creados`}
                      {stats.updated_count > 0 && ` • ${stats.updated_count} actualizados`}
                      {stats.failed_count > 0 && ` • ${stats.failed_count} fallidos`}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p>No hay datos de importaciones previas</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Column Mapping */}
      {source.column_mapping && (() => {
        // Support both legacy flat format and new { delimiter, mappings } format
        const cm = source.column_mapping
        const mappings: Record<string, string> = cm.mappings ?? cm
        const delimiter: string | null = cm.delimiter ?? null
        const entries = Object.entries(mappings).filter(([, v]) => typeof v === "string")
        if (entries.length === 0) return null
        return (
          <Card>
            <CardHeader>
              <CardTitle>Mapeo de Columnas</CardTitle>
              <CardDescription>
                {delimiter && <span className="font-mono text-xs">Delimitador: "{delimiter}" · </span>}
                {entries.length} columnas mapeadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {entries.map(([csvCol, internalField]) => {
                  const isCustom = isCustomField(internalField)
                  return (
                    <div key={csvCol} className="flex items-center gap-2 p-2.5 border rounded-lg text-sm">
                      <span className="font-mono text-xs text-muted-foreground flex-1 truncate" title={csvCol}>{csvCol}</span>
                      <span className="text-muted-foreground text-xs">→</span>
                      {isCustom ? (
                        <span className="text-amber-400 font-mono text-xs">{customFieldKey(internalField)}</span>
                      ) : (
                        <span className="font-medium text-xs">{internalField}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild>
            <Link href={`/inventory/sources/batch-import?sourceId=${sourceId}`}>
              <Play className="mr-2 h-4 w-4" />
              Ejecutar Importación
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/inventory/sources/new?edit=${sourceId}`}>
              <Settings className="mr-2 h-4 w-4" />
              Editar Configuración
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/inventory/sources/${sourceId}/history`}>
              <History className="mr-2 h-4 w-4" />
              Ver Historial Completo
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
