"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { ArrowLeft, Save, Download, Check, X } from "lucide-react"
import Link from "next/link"
import { INTERNAL_FIELDS, generateSuggestedMapping, validateMapping } from "@/lib/column-mapping-helpers"

export default function NewSourcePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  
  // Campos del formulario
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [urlTemplate, setUrlTemplate] = useState("")
  const [authType, setAuthType] = useState("query_params")
  const [feedType, setFeedType] = useState("catalog")
  const [isActive, setIsActive] = useState(true)
  
  // Credenciales según tipo de auth
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [bearerToken, setBearerToken] = useState("")
  const [queryParams, setQueryParams] = useState("")
  
  // Column mapping wizard
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [detectedDelimiter, setDetectedDelimiter] = useState<string>(",")
  const [sampleRows, setSampleRows] = useState<any[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [detectingHeaders, setDetectingHeaders] = useState(false)
  const [showMappingWizard, setShowMappingWizard] = useState(false)

  const handleDetectColumns = async () => {
    if (!urlTemplate) {
      toast({
        title: "Error",
        description: "Ingresa una URL primero",
        variant: "destructive"
      })
      return
    }
    
    setDetectingHeaders(true)
    
    try {
      const params = new URLSearchParams({ url: urlTemplate })
      const response = await fetch(`/api/inventory/sources/preview?${params}`)
      const data = await response.json()
      
      if (!data.ok) {
        throw new Error(data.error || "Error al detectar columnas")
      }
      
      setDetectedHeaders(data.headers || [])
      setDetectedDelimiter(data.detected_delimiter || ",")
      setSampleRows(data.sample_rows || [])
      
      // Generar mapeo sugerido automáticamente
      const suggested = generateSuggestedMapping(data.headers || [])
      setMapping(suggested)
      setShowMappingWizard(true)
      
      toast({
        title: "Columnas detectadas",
        description: `Se detectaron ${data.headers?.length || 0} columnas con delimitador "${data.detected_delimiter}"`
      })
    } catch (error: any) {
      console.error("[v0] Error detecting columns:", error)
      toast({
        title: "Error",
        description: error.message || "No se pudo detectar las columnas",
        variant: "destructive"
      })
    } finally {
      setDetectingHeaders(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name || !urlTemplate) {
      toast({
        title: "Error",
        description: "Nombre y URL Template son obligatorios",
        variant: "destructive"
      })
      return
    }
    
    setLoading(true)
    
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      // Construir credentials según tipo de auth
      let credentials: any = {}
      
      if (authType === "basic_auth") {
        credentials = { username, password }
      } else if (authType === "bearer_token") {
        credentials = { token: bearerToken }
      } else if (authType === "query_params") {
        try {
          credentials = queryParams ? JSON.parse(queryParams) : {}
        } catch {
          toast({
            title: "Error",
            description: "Query params debe ser un JSON válido",
            variant: "destructive"
          })
          setLoading(false)
          return
        }
      }
      
      // Validar column mapping
      if (Object.keys(mapping).length === 0) {
        toast({
          title: "Error",
          description: "Debes configurar el mapeo de columnas primero",
          variant: "destructive"
        })
        setLoading(false)
        return
      }
      
      const validation = validateMapping(mapping)
      if (!validation.valid) {
        toast({
          title: "Error en mapeo",
          description: validation.error,
          variant: "destructive"
        })
        setLoading(false)
        return
      }
      
      const parsedMapping = {
        delimiter: detectedDelimiter,
        mappings: mapping
      }
      
      const { error } = await supabase.from("import_sources").insert({
        name,
        description: description || null,
        url_template: urlTemplate,
        auth_type: authType,
        credentials,
        feed_type: feedType,
        column_mapping: parsedMapping,
        is_active: isActive
      })
      
      if (error) throw error
      
      toast({
        title: "Fuente creada",
        description: "La fuente de importación se ha creado correctamente"
      })
      
      router.push("/inventory/sources")
    } catch (error: any) {
      console.error("[v0] Error creating source:", error)
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la fuente",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/inventory/sources">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Fuentes
          </Button>
        </Link>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Nueva Fuente de Importación</CardTitle>
          <CardDescription>
            Configura una nueva fuente para importar productos desde CSV/API externa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Información básica */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Proveedor Principal"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción opcional de la fuente"
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="urlTemplate">URL Template *</Label>
                <Input
                  id="urlTemplate"
                  value={urlTemplate}
                  onChange={(e) => setUrlTemplate(e.target.value)}
                  placeholder="https://ejemplo.com/products.csv"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  URL completa del CSV o endpoint API
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="feedType">Tipo de Feed</Label>
                <Select value={feedType} onValueChange={setFeedType}>
                  <SelectTrigger id="feedType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="catalog">Catálogo Completo</SelectItem>
                    <SelectItem value="stock_price">Stock y Precios</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Autenticación */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Autenticación</h3>
              
              <div className="space-y-2">
                <Label htmlFor="authType">Tipo de Autenticación</Label>
                <Select value={authType} onValueChange={setAuthType}>
                  <SelectTrigger id="authType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="query_params">Query Parameters</SelectItem>
                    <SelectItem value="basic_auth">Basic Auth</SelectItem>
                    <SelectItem value="bearer_token">Bearer Token</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {authType === "basic_auth" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Usuario"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Contraseña"
                    />
                  </div>
                </>
              )}
              
              {authType === "bearer_token" && (
                <div className="space-y-2">
                  <Label htmlFor="bearerToken">Bearer Token</Label>
                  <Input
                    id="bearerToken"
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="Token de autenticación"
                  />
                </div>
              )}
              
              {authType === "query_params" && (
                <div className="space-y-2">
                  <Label htmlFor="queryParams">Query Parameters (JSON)</Label>
                  <Textarea
                    id="queryParams"
                    value={queryParams}
                    onChange={(e) => setQueryParams(e.target.value)}
                    placeholder='{"api_key": "tu-api-key", "token": "valor"}'
                    rows={3}
                  />
                  <p className="text-sm text-muted-foreground">
                    Formato JSON con los parámetros de query string
                  </p>
                </div>
              )}
            </div>
            
            {/* Column Mapping Wizard */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Mapeo de Columnas</h3>
                <Button
                  type="button"
                  onClick={handleDetectColumns}
                  disabled={!urlTemplate || detectingHeaders}
                  variant="outline"
                  size="sm"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {detectingHeaders ? "Detectando..." : "Detectar Columnas"}
                </Button>
              </div>
              
              {showMappingWizard && detectedHeaders.length > 0 && (
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {detectedHeaders.length} columnas detectadas • Delimitador: "{detectedDelimiter}"
                    </p>
                    {Object.keys(mapping).length > 0 && (
                      <div className="flex items-center text-sm text-green-600">
                        <Check className="mr-1 h-4 w-4" />
                        {Object.keys(mapping).length} campos mapeados
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {detectedHeaders.map((header, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">
                            Columna CSV
                          </Label>
                          <div className="font-mono text-sm mt-1 p-2 bg-background rounded border">
                            {header}
                          </div>
                        </div>
                        <div className="text-muted-foreground">→</div>
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">
                            Campo Interno
                          </Label>
                          <Select
                            value={mapping[header] || "_ignore"}
                            onValueChange={(value) => {
                              const newMapping = { ...mapping }
                              if (value === "_ignore") {
                                delete newMapping[header]
                              } else {
                                newMapping[header] = value
                              }
                              setMapping(newMapping)
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_ignore">
                                <span className="text-muted-foreground">Ignorar</span>
                              </SelectItem>
                              {INTERNAL_FIELDS.map(field => (
                                <SelectItem key={field.key} value={field.key}>
                                  {field.label} {field.required && "*"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {sampleRows.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Ver datos de muestra ({sampleRows.length} filas)
                      </summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b">
                              {detectedHeaders.map((h, i) => (
                                <th key={i} className="p-2 text-left bg-muted font-medium">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sampleRows.map((row, i) => (
                              <tr key={i} className="border-b">
                                {detectedHeaders.map((h, j) => (
                                  <td key={j} className="p-2 max-w-[200px] truncate">
                                    {row[h] || "-"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              )}
              
              {!showMappingWizard && (
                <p className="text-sm text-muted-foreground">
                  Haz clic en "Detectar Columnas" para configurar el mapeo automáticamente
                </p>
              )}
            </div>
            
            {/* Estado activo */}
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="isActive">Fuente activa</Label>
            </div>
            
            {/* Botones */}
            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                <Save className="mr-2 h-4 w-4" />
                {loading ? "Guardando..." : "Guardar Fuente"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/inventory/sources")}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
