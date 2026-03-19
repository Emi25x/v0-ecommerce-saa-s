"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, ExternalLink, Download } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function CatalogSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const catalogId = id

  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [catalog, setCatalog] = useState<any>(null)

  // Form fields
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [feedType, setFeedType] = useState("catalog")
  const [urlTemplate, setUrlTemplate] = useState("")
  const [authType, setAuthType] = useState("none")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [bearerToken, setBearerToken] = useState("")
  const [queryParams, setQueryParams] = useState<Array<{ key: string; value: string }>>([])
  const [columnMapping, setColumnMapping] = useState("")

  // Preview data
  const [previewData, setPreviewData] = useState<any>(null)

  useEffect(() => {
    fetchCatalog()
  }, [catalogId])

  const fetchCatalog = async () => {
    try {
      const res = await fetch(`/api/suppliers/catalogs/${catalogId}`)
      const data = await res.json()

      if (data.catalog) {
        const cat = data.catalog
        setCatalog(cat)
        setName(cat.name || "")
        setDescription(cat.description || "")
        setFeedType(cat.feed_type || "catalog")
        setUrlTemplate(cat.url_template || "")
        setAuthType(cat.auth_type || "none")

        // Load credentials if exists
        if (cat.credentials) {
          if (cat.auth_type === "basic_auth") {
            setUsername(cat.credentials.username || "")
            setPassword(cat.credentials.password || "")
          } else if (cat.auth_type === "bearer_token") {
            setBearerToken(cat.credentials.token || "")
          } else if (cat.auth_type === "query_params" && cat.credentials.params) {
            const params = Object.entries(cat.credentials.params).map(([key, value]) => ({
              key,
              value: value as string,
            }))
            setQueryParams(params)
          }
        }

        // Load column mapping
        if (cat.column_mapping) {
          setColumnMapping(JSON.stringify(cat.column_mapping, null, 2))
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo cargar la configuración del catálogo",
        variant: "destructive",
      })
    }
  }

  const handleTestDownload = async () => {
    setTesting(true)
    setPreviewData(null)

    try {
      // Build credentials
      let credentials: any = null

      if (authType === "basic_auth") {
        credentials = { username, password }
      } else if (authType === "bearer_token") {
        credentials = { token: bearerToken }
      } else if (authType === "query_params") {
        const params: Record<string, string> = {}
        queryParams.forEach((param) => {
          if (param.key && param.value) {
            params[param.key] = param.value
          }
        })
        credentials = { type: "query_params", params }
      }

      const res = await fetch("/api/inventory/sources/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url_template: urlTemplate,
          auth_type: authType,
          credentials,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al descargar preview")
      }

      setPreviewData(data)

      toast({
        title: "Preview exitoso",
        description: `Se detectaron ${data.columns?.length || 0} columnas y ${data.sample_rows?.length || 0} filas de muestra`,
      })
    } catch (error: any) {
      toast({
        title: "Error en preview",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)

    try {
      // Build credentials
      let credentials: any = null

      if (authType === "basic_auth") {
        credentials = { username, password }
      } else if (authType === "bearer_token") {
        credentials = { token: bearerToken }
      } else if (authType === "query_params") {
        const params: Record<string, string> = {}
        queryParams.forEach((param) => {
          if (param.key && param.value) {
            params[param.key] = param.value
          }
        })
        credentials = { type: "query_params", params }
      }

      // Parse column mapping
      let parsedMapping = null
      if (columnMapping.trim()) {
        try {
          parsedMapping = JSON.parse(columnMapping)
        } catch {
          toast({
            title: "Error",
            description: "El mapeo de columnas debe ser un JSON válido",
            variant: "destructive",
          })
          setLoading(false)
          return
        }
      }

      const res = await fetch(`/api/suppliers/catalogs/${catalogId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          feed_type: feedType,
          url_template: urlTemplate,
          auth_type: authType,
          credentials,
          column_mapping: parsedMapping,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al guardar")
      }

      toast({
        title: "Guardado exitoso",
        description: "La configuración del catálogo se actualizó correctamente",
      })

      router.push("/suppliers")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (!catalog) {
    return (
      <div className="p-8">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/suppliers")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Configuración de Catálogo</h1>
          <p className="text-sm text-muted-foreground">{catalog.supplier?.name}</p>
        </div>
      </div>

      {/* Basic Info */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Información General</h2>

        <div className="space-y-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Catálogo Completo" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción del catálogo"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="feedType">Tipo de Feed</Label>
          <Select value={feedType} onValueChange={setFeedType}>
            <SelectTrigger id="feedType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="catalog">Catálogo</SelectItem>
              <SelectItem value="stock">Stock</SelectItem>
              <SelectItem value="prices">Precios</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Feed URL */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">URL del Feed</h2>
          {urlTemplate && (
            <Button variant="ghost" size="sm" asChild>
              <a href={urlTemplate} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Ver feed raw
              </a>
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="url">URL Template *</Label>
          <Input
            id="url"
            value={urlTemplate}
            onChange={(e) => setUrlTemplate(e.target.value)}
            placeholder="https://ejemplo.com/catalog.csv"
          />
          <p className="text-xs text-muted-foreground">URL completa del archivo CSV o endpoint API</p>
        </div>
      </Card>

      {/* Authentication */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Autenticación</h2>

        <div className="space-y-2">
          <Label htmlFor="authType">Tipo de Autenticación</Label>
          <Select value={authType} onValueChange={setAuthType}>
            <SelectTrigger id="authType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin autenticación</SelectItem>
              <SelectItem value="query_params">Query Parameters</SelectItem>
              <SelectItem value="basic_auth">Usuario/Contraseña (Basic Auth)</SelectItem>
              <SelectItem value="bearer_token">Bearer Token</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {authType === "basic_auth" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
        )}

        {authType === "bearer_token" && (
          <div className="space-y-2">
            <Label htmlFor="token">Bearer Token</Label>
            <Input id="token" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} />
          </div>
        )}

        {authType === "query_params" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Parámetros de Query String</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQueryParams([...queryParams, { key: "", value: "" }])}
              >
                Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {queryParams.map((param, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Clave"
                    value={param.key}
                    onChange={(e) => {
                      const newParams = [...queryParams]
                      newParams[index].key = e.target.value
                      setQueryParams(newParams)
                    }}
                  />
                  <Input
                    placeholder="Valor"
                    value={param.value}
                    onChange={(e) => {
                      const newParams = [...queryParams]
                      newParams[index].value = e.target.value
                      setQueryParams(newParams)
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setQueryParams(queryParams.filter((_, i) => i !== index))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Column Mapping */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Mapeo de Columnas</h2>

        <div className="space-y-2">
          <Label htmlFor="mapping">JSON de Mapeo</Label>
          <Textarea
            id="mapping"
            value={columnMapping}
            onChange={(e) => setColumnMapping(e.target.value)}
            placeholder='{"ISBN": "isbn", "Titulo": "title", "Precio": "price"}'
            rows={6}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Mapeo de columnas del CSV a campos del sistema (formato JSON)</p>
        </div>
      </Card>

      {/* Test Download */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Probar Descarga</h2>
          <Button onClick={handleTestDownload} disabled={testing || !urlTemplate} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {testing ? "Descargando..." : "Probar"}
          </Button>
        </div>

        {previewData && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">Columnas detectadas: {previewData.columns?.length || 0}</p>
              <p className="text-xs text-muted-foreground">{previewData.columns?.join(", ")}</p>
            </div>

            {previewData.sample_rows && previewData.sample_rows.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Primeras 3 filas:</p>
                <div className="border rounded-lg overflow-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {previewData.columns?.map((col: string) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.sample_rows.slice(0, 3).map((row: any, idx: number) => (
                        <TableRow key={idx}>
                          {previewData.columns?.map((col: string) => (
                            <TableCell key={col} className="text-xs">
                              {row[col] || "-"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex gap-4">
        <Button onClick={handleSave} disabled={loading || !name || !urlTemplate} className="flex-1">
          {loading ? "Guardando..." : "Guardar Cambios"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/suppliers")}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
