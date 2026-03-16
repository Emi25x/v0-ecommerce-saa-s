"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { INTERNAL_FIELDS, generateSuggestedMapping, validateMapping, CUSTOM_FIELD_PREFIX, isCustomField, customFieldKey, makeCustomFieldValue } from "@/lib/column-mapping-helpers"

export default function NewSourcePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("edit") // present when editing an existing source
  const isEditMode = !!editId
  const [loading, setLoading] = useState(false)
  const [warehouseColMissing, setWarehouseColMissing] = useState(false)

  // Campos del formulario
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [urlTemplate, setUrlTemplate] = useState("")
  const [authType, setAuthType] = useState("none")
  const [feedType, setFeedType] = useState("catalog")
  const [isActive, setIsActive] = useState(true)
  const [warehouseId, setWarehouseId] = useState<string>("none")
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([])
  
  // Credenciales según tipo de auth
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [bearerToken, setBearerToken] = useState("")
  const [queryParamsList, setQueryParamsList] = useState<Array<{ key: string; value: string }>>([
    { key: "user", value: "" },
    { key: "password", value: "" }
  ])
  const [showUrlWarning, setShowUrlWarning] = useState(false)
  
  // Column mapping wizard
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [detectedDelimiter, setDetectedDelimiter] = useState<string>(",")
  const [sampleRows, setSampleRows] = useState<any[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [detectingHeaders, setDetectingHeaders] = useState(false)
  const [showMappingWizard, setShowMappingWizard] = useState(false)
  // Track which headers are in "custom name" input mode
  const [customInputFor, setCustomInputFor] = useState<Record<string, string>>({})

  // Verificar si la columna warehouse_id existe en la DB
  useEffect(() => {
    fetch("/api/migrations/warehouse-column")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.column_exists === false) setWarehouseColMissing(true) })
      .catch(() => {})
  }, [])

  // Cargar almacenes disponibles
  useEffect(() => {
    fetch("/api/warehouses")
      .then(r => r.ok ? r.json() : { warehouses: [] })
      .then((data: any) => setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []))
      .catch(() => {})
  }, [])

  // Si estamos en modo edición, cargar los datos de la fuente existente
  useEffect(() => {
    if (!editId) return
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.from("import_sources").select("*").eq("id", editId).single()
      .then(({ data, error }) => {
        if (error || !data) return
        setName(data.name ?? "")
        setDescription(data.description ?? "")
        setUrlTemplate(data.url_template ?? "")
        setAuthType(data.auth_type ?? "none")
        setFeedType(data.feed_type ?? "catalog")
        setIsActive(data.is_active ?? true)
        setWarehouseId(data.warehouse_id ?? "none")

        // Credenciales
        const creds = data.credentials ?? {}
        if (data.auth_type === "basic_auth") {
          setUsername(creds.username ?? "")
          setPassword(creds.password ?? "")
        } else if (data.auth_type === "bearer_token") {
          setBearerToken(creds.token ?? "")
        } else if (data.auth_type === "query_params" && creds.params) {
          setQueryParamsList(
            Object.entries(creds.params).map(([key, value]) => ({ key, value: String(value) }))
          )
        }

        // Column mapping — soportar formato plano y { delimiter, mappings }
        const cm = data.column_mapping ?? {}
        const storedMappings: Record<string, string> = cm.mappings ?? cm
        const storedDelimiter: string = cm.delimiter ?? ","
        const validMappings: Record<string, string> = {}
        for (const [k, v] of Object.entries(storedMappings)) {
          if (typeof v === "string") validMappings[k] = v
        }
        if (Object.keys(validMappings).length > 0) {
          setMapping(validMappings)
          setDetectedHeaders(Object.keys(validMappings))
          setDetectedDelimiter(storedDelimiter)
          setShowMappingWizard(true)
        }
      })
  }, [editId])

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
      let credentials: any = null
      
      if (authType === "basic_auth") {
        credentials = { username, password }
      } else if (authType === "bearer_token") {
        credentials = { token: bearerToken }
      } else if (authType === "query_params") {
        // Convertir la lista de parámetros a objeto
        const params: Record<string, string> = {}
        queryParamsList.forEach(param => {
          if (param.key && param.value) {
            params[param.key] = param.value
          }
        })
        credentials = {
          type: "query_params",
          params
        }
      } else if (authType === "none") {
        credentials = null
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
      
      // Para fuentes de stock+precio por EAN, relajamos la validación (no se exige title)
      const isStockPriceByEan = feedType === "stock_price" && (mapping.ean || mapping.isbn)
      if (!isStockPriceByEan) {
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
      } else if (!mapping.ean && !mapping.isbn) {
        toast({
          title: "Error en mapeo",
          description: "Para fuentes de stock+precio debes mapear al menos el campo 'ean' o 'isbn'",
          variant: "destructive"
        })
        setLoading(false)
        return
      }

      const parsedMapping = {
        delimiter: detectedDelimiter,
        mappings: mapping
      }
      
      const insertPayload: Record<string, unknown> = {
        name,
        description: description || null,
        url_template: urlTemplate,
        auth_type: authType,
        credentials: credentials ?? {},
        feed_type: feedType,
        column_mapping: parsedMapping,
        is_active: isActive,
        warehouse_id: warehouseId && warehouseId !== "none" ? warehouseId : null,
      }

      let error: any
      if (isEditMode) {
        // UPDATE
        ;({ error } = await supabase.from("import_sources").update(insertPayload).eq("id", editId!))
        if (error?.message?.includes("warehouse_id")) {
          const { warehouse_id: _wh, ...payloadWithoutWh } = insertPayload as any
          ;({ error } = await supabase.from("import_sources").update(payloadWithoutWh).eq("id", editId!))
        }
      } else {
        // INSERT
        ;({ error } = await supabase.from("import_sources").insert(insertPayload))
        if (error?.message?.includes("warehouse_id")) {
          console.warn("[new-source] warehouse_id column missing, run migration 050. Retrying without it.")
          const { warehouse_id: _wh, ...payloadWithoutWh } = insertPayload as any
          ;({ error } = await supabase.from("import_sources").insert(payloadWithoutWh))
        }
      }

      if (error) throw error

      toast({
        title: isEditMode ? "Fuente actualizada" : "Fuente creada",
        description: isEditMode
          ? "Los cambios se guardaron correctamente"
          : "La fuente de importación se ha creado correctamente"
      })

      router.push(isEditMode ? `/inventory/sources/${editId}` : "/inventory/sources")
    } catch (error: any) {
      console.error("[v0] Error saving source:", error)
      toast({
        title: "Error",
        description: error.message || (isEditMode ? "No se pudo actualizar la fuente" : "No se pudo crear la fuente"),
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
          <CardTitle>{isEditMode ? "Editar Fuente de Importación" : "Nueva Fuente de Importación"}</CardTitle>
          <CardDescription>
            {isEditMode
              ? "Modificá la configuración de esta fuente de importación"
              : "Configura una nueva fuente para importar productos desde CSV/API externa"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {warehouseColMissing && (
            <div className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400 space-y-2">
              <p className="font-medium">Migración pendiente: columna <code>warehouse_id</code></p>
              <p className="text-xs text-amber-400/80">
                El almacén no se guardará hasta ejecutar este SQL en el{" "}
                <strong>SQL Editor de Supabase</strong>:
              </p>
              <pre className="bg-black/30 rounded p-2 text-xs font-mono overflow-x-auto select-all">
                {`ALTER TABLE import_sources\n  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;`}
              </pre>
            </div>
          )}
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
                  onChange={(e) => {
                    const newUrl = e.target.value
                    setUrlTemplate(newUrl)
                    // Detectar si la URL tiene query params
                    if (newUrl.includes('?')) {
                      setShowUrlWarning(true)
                    } else {
                      setShowUrlWarning(false)
                    }
                  }}
                  placeholder="https://ejemplo.com/products.csv"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  URL completa del CSV o endpoint API
                </p>
                {showUrlWarning && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                    <span>⚠️</span>
                    <p>
                      Tu URL parece incluir parámetros (?...). Revisá si corresponde usar "Query Parameters" como tipo de autenticación.
                    </p>
                  </div>
                )}
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

              {/* Almacén asociado */}
              <div className="space-y-2">
                <Label htmlFor="warehouseId">Almacén asociado</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger id="warehouseId">
                    <SelectValue placeholder="Seleccionar almacén..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin almacén específico</SelectItem>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  El stock importado se acumula en este almacén. Luego, en la configuración de cada
                  cuenta de ML se elige qué almacén usar para sincronizar el stock.
                </p>
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
                    <SelectItem value="none">Sin autenticación</SelectItem>
                    <SelectItem value="query_params">Query Parameters</SelectItem>
                    <SelectItem value="basic_auth">Usuario/Contraseña (Header Authorization)</SelectItem>
                    <SelectItem value="bearer_token">Bearer Token</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  <p>• <strong>Sin autenticación:</strong> Para URLs públicas</p>
                  <p>• <strong>Query Parameters:</strong> Si tu URL ya trae ?user=... o similar</p>
                  <p>• <strong>Usuario/Contraseña:</strong> Para Basic Auth en header Authorization</p>
                </div>
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Parámetros de Query String</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setQueryParamsList([...queryParamsList, { key: "", value: "" }])
                      }}
                    >
                      Agregar parámetro
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {queryParamsList.map((param, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          placeholder="Clave (ej: user)"
                          value={param.key}
                          onChange={(e) => {
                            const newList = [...queryParamsList]
                            newList[index].key = e.target.value
                            setQueryParamsList(newList)
                          }}
                          className="flex-1"
                        />
                        <span className="text-muted-foreground">=</span>
                        <Input
                          placeholder="Valor"
                          value={param.value}
                          onChange={(e) => {
                            const newList = [...queryParamsList]
                            newList[index].value = e.target.value
                            setQueryParamsList(newList)
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setQueryParamsList(queryParamsList.filter((_, i) => i !== index))
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Estos parámetros se agregarán a la URL como ?clave=valor&...
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
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 text-xs text-muted-foreground font-medium pb-1 border-b border-border/30">
                      <span>Columna CSV</span>
                      <span />
                      <span>Campo interno</span>
                    </div>
                    {detectedHeaders.map((header, idx) => {
                      const currentValue = mapping[header] || "_ignore"
                      const isCustom = isCustomField(currentValue)
                      const isEditingCustom = customInputFor[header] !== undefined

                      return (
                        <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
                          {/* CSV column name */}
                          <div className="font-mono text-sm p-2 bg-background rounded border truncate" title={header}>
                            {header}
                          </div>

                          <div className="text-muted-foreground text-xs">→</div>

                          {/* Internal field selector or custom name input */}
                          <div>
                            {isEditingCustom ? (
                              <div className="flex gap-1">
                                <Input
                                  autoFocus
                                  className="h-8 text-xs font-mono"
                                  placeholder="ej: precio_eur"
                                  value={customInputFor[header]}
                                  onChange={e => {
                                    const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                                    setCustomInputFor(prev => ({ ...prev, [header]: sanitized }))
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      const key = customInputFor[header].trim()
                                      if (key) {
                                        setMapping(prev => ({ ...prev, [header]: makeCustomFieldValue(key) }))
                                      }
                                      setCustomInputFor(prev => { const n = { ...prev }; delete n[header]; return n })
                                    }
                                    if (e.key === "Escape") {
                                      setCustomInputFor(prev => { const n = { ...prev }; delete n[header]; return n })
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    const key = customInputFor[header].trim()
                                    if (key) {
                                      setMapping(prev => ({ ...prev, [header]: makeCustomFieldValue(key) }))
                                    }
                                    setCustomInputFor(prev => { const n = { ...prev }; delete n[header]; return n })
                                  }}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={() => setCustomInputFor(prev => { const n = { ...prev }; delete n[header]; return n })}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Select
                                value={isCustom ? "_custom_set" : currentValue}
                                onValueChange={(value) => {
                                  if (value === "_custom_new") {
                                    setCustomInputFor(prev => ({ ...prev, [header]: "" }))
                                    return
                                  }
                                  const newMapping = { ...mapping }
                                  if (value === "_ignore") {
                                    delete newMapping[header]
                                  } else {
                                    newMapping[header] = value
                                  }
                                  setMapping(newMapping)
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue>
                                    {isCustom
                                      ? <span className="text-amber-400 font-mono">campo: {customFieldKey(currentValue)}</span>
                                      : undefined}
                                  </SelectValue>
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
                                  {isCustom && (
                                    <SelectItem value="_custom_set">
                                      <span className="text-amber-400 font-mono">campo: {customFieldKey(currentValue)}</span>
                                    </SelectItem>
                                  )}
                                  <SelectItem value="_custom_new">
                                    <span className="text-blue-400">+ Nueva columna personalizada…</span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      )
                    })}
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
                {loading ? "Guardando..." : isEditMode ? "Guardar Cambios" : "Guardar Fuente"}
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
