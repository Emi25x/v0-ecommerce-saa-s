"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Calendar,
  Clock,
  FileText,
  Play,
  Settings,
  Trash2,
  Upload,
  History,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  StopCircle,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"

interface ImportSource {
  id: string
  name: string
  description: string | null
  feed_type: string
  url_template: string | null
  column_mapping: Record<string, string>
  overwrite_duplicates: boolean
  created_at: string
  updated_at: string
}

interface ImportSchedule {
  id: string
  source_id: string
  frequency: string
  timezone: string
  enabled: boolean
  hour: number
  minute: number // Agregando campo minute
  day_of_week: number | null
  day_of_month: number | null
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

interface SourceWithSchedule extends ImportSource {
  schedules: ImportSchedule[]
  last_import?: {
    started_at: string
    status: string
    products_imported: number
    products_updated: number
    products_failed: number
  }
}

export default function ImportSourcesPage() {
  const [sources, setSources] = useState<SourceWithSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSource, setSelectedSource] = useState<SourceWithSchedule | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [runningImports, setRunningImports] = useState<Map<string, string>>(new Map())
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [schedulesTableExists, setSchedulesTableExists] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false)
  const [sourceToImport, setSourceToImport] = useState<SourceWithSchedule | null>(null)
  const [showProgressDialog, setShowProgressDialog] = useState(false)
  const [backgroundImports, setBackgroundImports] = useState<Map<string, typeof importProgress>>(new Map())
  const [importProgress, setImportProgress] = useState({
    total: 0,
    processed: 0,
    imported: 0,
    updated: 0,
    failed: 0,
    status: "running" as "running" | "completed" | "cancelled" | "error",
    startTime: null as Date | null,
    lastUpdate: null as Date | null,
    speed: 0,
    errors: [] as Array<{ sku: string; message: string; details: string }>,
    csvInfo: null as null | {
      headers: string[]
      columnMapping: Record<string, string>
      firstRow: Record<string, string>
    },
  })
  const [currentImportHistoryId, setCurrentImportHistoryId] = useState<string | null>(null)
  const [scheduleConfig, setScheduleConfig] = useState({
    enabled: false,
    frequency: "daily",
    timezone: "America/Argentina/Buenos_Aires",
    hour: "00:00",
    dayOfWeek: 1,
    dayOfMonth: 1,
  })

  const [importMode, setImportMode] = useState<"update" | "overwrite" | "skip">("update")

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    loadSources()
    const interval = setInterval(checkRunningImports, 5000)
    // Ya no se necesita este intervalo ya que el progreso se actualiza vía polling desde executeImport
    // const progressInterval = setInterval(updateImportProgress, 2000)
    return () => {
      clearInterval(interval)
      // clearInterval(progressInterval)
    }
  }, [])

  async function loadSources() {
    try {
      console.log("[v0] Cargando fuentes de importación...")
      setLoading(true)

      // Cargar fuentes
      const { data: sourcesData, error: sourcesError } = await supabase
        .from("import_sources")
        .select("*")
        .order("created_at", { ascending: false })

      if (sourcesError) throw sourcesError

      let schedulesData: any[] = []
      const { data: schedules, error: schedulesError } = await supabase.from("import_schedules").select("*")

      if (schedulesError) {
        console.log("[v0] No se pudieron cargar las programaciones (tabla no existe):", schedulesError.message)
        setSchedulesTableExists(false)
      } else {
        schedulesData = schedules || []
        setSchedulesTableExists(true)
      }

      // Cargar último historial de cada fuente
      const { data: historyData, error: historyError } = await supabase
        .from("import_history")
        .select("source_id, started_at, status, products_imported, products_updated, products_failed")
        .order("started_at", { ascending: false })

      if (historyError) {
        console.log("[v0] No se pudo cargar el historial:", historyError.message)
      }

      // Combinar datos
      const sourcesWithSchedules: SourceWithSchedule[] = (sourcesData || []).map((source) => ({
        ...source,
        schedules: schedulesData.filter((s) => s.source_id === source.id),
        last_import: historyData?.find((h) => h.source_id === source.id),
      }))

      console.log("[v0] Fuentes cargadas:", sourcesWithSchedules.length)
      setSources(sourcesWithSchedules)
    } catch (error) {
      console.error("[v0] Error loading sources:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las fuentes de importación",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleRunImport(source: SourceWithSchedule) {
    setSourceToImport(source)
    setImportMode("update") // Por defecto: actualizar datos
    setShowImportConfirmDialog(true)
  }

  async function executeImport(source: SourceWithSchedule) {
    try {
      setImporting(source.id)
      setShowProgressDialog(true)
      const now = new Date()
      setImportProgress({
        total: 0,
        processed: 0,
        imported: 0,
        updated: 0,
        failed: 0,
        status: "running",
        startTime: now,
        lastUpdate: now,
        speed: 0,
        errors: [],
        csvInfo: null,
      })

      console.log("[v0] ===== INICIANDO IMPORTACIÓN DIRECTA DESDE NAVEGADOR =====")
      console.log("[v0] Fuente:", source.name)
      console.log("[v0] URL:", source.url_template)
      console.log("[v0] Modo de importación:", importMode)
      console.log("[v0] Hora de inicio:", now.toLocaleString())

      if (!source.url_template) {
        throw new Error("La fuente no tiene una URL configurada")
      }

      console.log("[v0] Descargando CSV desde:", source.url_template)
      const csvResponse = await fetch(source.url_template)
      if (!csvResponse.ok) {
        throw new Error(`Error al descargar CSV: ${csvResponse.statusText}`)
      }

      const csvText = await csvResponse.text()
      console.log("[v0] CSV descargado, tamaño:", csvText.length, "bytes")

      const lines = csvText.split("\n").filter((line) => line.trim())
      const firstLine = lines[0]

      // Detectar el separador más probable (el que aparece más veces en la primera línea)
      const separators = ["|", ";", ",", "\t"]
      const separatorCounts = separators.map((sep) => ({
        separator: sep,
        count: (firstLine.match(new RegExp(`\\${sep}`, "g")) || []).length,
      }))
      const detectedSeparator = separatorCounts.reduce((max, current) =>
        current.count > max.count ? current : max,
      ).separator

      console.log("[v0] Separador detectado:", detectedSeparator === "\t" ? "TAB" : detectedSeparator)
      console.log("[v0] Primera línea del CSV:", firstLine.substring(0, 200))

      const headers = firstLine.split(detectedSeparator).map((h) => h.trim().replace(/^"|"$/g, ""))
      console.log("[v0] Headers del CSV:", headers)
      console.log("[v0] Total de líneas (incluyendo header):", lines.length)

      const columnMapping = {
        sku:
          headers.find((h) => /^(sku|codigo|cod|referencia|ref|code|id)$/i.test(h.trim())) || source.column_mapping.sku,
        title:
          headers.find((h) =>
            /^(nombre|name|titulo|title|descripcion|description|producto|product)$/i.test(h.trim()),
          ) ||
          source.column_mapping.title ||
          source.column_mapping.name,
        price: headers.find((h) => /^(precio|price|pvp|cost|costo)$/i.test(h.trim())) || source.column_mapping.price,
        stock:
          headers.find((h) => /^(stock|cantidad|quantity|existencia|disponible)$/i.test(h.trim())) ||
          source.column_mapping.stock,
        description:
          headers.find((h) => /^(descripcion|description|desc|detalle|sinopsis)$/i.test(h.trim())) ||
          source.column_mapping.description,
        category:
          headers.find((h) => /^(categoria|category|cat|tipo|type|familia|materia)$/i.test(h.trim())) ||
          source.column_mapping.category,
        brand:
          headers.find((h) => /^(marca|brand|fabricante|manufacturer|autor|editorial)$/i.test(h.trim())) ||
          source.column_mapping.brand,
      }

      console.log("[v0] Column mapping original:", source.column_mapping)
      console.log("[v0] Column mapping detectado automáticamente:", columnMapping)

      const firstRowData: Record<string, string> = {}
      if (lines.length > 1) {
        const firstDataLine = lines[1]
        const values = firstDataLine.split(detectedSeparator).map((v) => v.trim().replace(/^"|"$/g, ""))
        headers.forEach((header, index) => {
          firstRowData[header] = values[index] || ""
        })
      }

      const totalProducts = lines.length - 1
      setImportProgress({
        total: totalProducts,
        processed: 0, // Reiniciar progreso
        imported: 0,
        updated: 0,
        failed: 0,
        status: "running",
        startTime: now,
        lastUpdate: now,
        speed: 0,
        errors: [],
        csvInfo: {
          headers,
          columnMapping,
          firstRow: firstRowData,
        },
      })

      console.log("[v0] Total de productos a procesar:", totalProducts)
      console.log("[v0] Column mapping configurado:", source.column_mapping)

      const hasOnlyBasicData =
        !columnMapping.title && !columnMapping.description && !columnMapping.category && !columnMapping.brand
      console.log("[v0] Importación solo con datos básicos (precio/stock):", hasOnlyBasicData)

      const { data: historyData, error: historyError } = await supabase
        .from("import_history")
        .insert({
          source_id: source.id,
          started_at: now.toISOString(),
          status: "running",
          products_imported: 0,
          products_updated: 0,
          products_failed: 0,
        })
        .select()
        .single()

      if (historyError) {
        console.error("[v0] Error creando historial:", historyError)
        toast({
          title: "Error",
          description: `No se pudo crear el registro de historial: ${historyError.message}`,
          variant: "destructive",
        })
        setImporting(null)
        setShowProgressDialog(false)
        return
      } else {
        console.log("[v0] Historial creado con ID:", historyData.id)
        setCurrentImportHistoryId(historyData.id)
      }

      let imported = 0
      let updated = 0
      let failed = 0
      let skipped = 0
      const errorsList: Array<{ sku: string; message: string; details: string }> = []
      const missingProducts: string[] = []

      const batchSize = 10
      for (let i = 1; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, Math.min(i + batchSize, lines.length))

        await Promise.all(
          batch.map(async (line, batchIndex) => {
            const lineNumber = i + batchIndex
            try {
              const values = line.split(detectedSeparator).map((v) => v.trim().replace(/^"|"$/g, ""))
              const row: Record<string, string> = {}
              headers.forEach((header, index) => {
                row[header] = values[index] || ""
              })

              const sku = row[columnMapping.sku]
              if (!sku) {
                console.log(`[v0] Línea ${lineNumber}: SKU vacío, saltando`)
                console.log(`[v0] Línea ${lineNumber}: Columna SKU buscada: "${columnMapping.sku}"`)
                console.log(`[v0] Línea ${lineNumber}: Columnas disponibles:`, Object.keys(row))
                console.log(`[v0] Línea ${lineNumber}: Primera fila de datos:`, row)
                failed++
                if (errorsList.length < 5) {
                  errorsList.push({
                    sku: `Línea ${lineNumber}`,
                    message: "SKU vacío",
                    details: `La columna "${columnMapping.sku}" no contiene un SKU válido. Columnas disponibles: ${Object.keys(row).join(", ")}`,
                  })
                }
                return
              }

              const { data: existingProduct } = await supabase.from("products").select("id").eq("sku", sku).single()

              const productData: any = {
                sku,
                source: [source.id],
              }

              if (columnMapping.title && row[columnMapping.title]) {
                productData.title = row[columnMapping.title]
              }
              if (columnMapping.price && row[columnMapping.price]) {
                productData.price = Number.parseFloat(row[columnMapping.price].replace(",", ".")) || 0
              }
              if (columnMapping.stock && row[columnMapping.stock]) {
                productData.stock = Number.parseInt(row[columnMapping.stock]) || 0
              }
              if (columnMapping.description && row[columnMapping.description]) {
                productData.description = row[columnMapping.description]
              }
              if (columnMapping.category && row[columnMapping.category]) {
                productData.category = row[columnMapping.category]
              }
              if (columnMapping.brand && row[columnMapping.brand]) {
                productData.brand = row[columnMapping.brand]
              }

              if (existingProduct) {
                if (importMode === "skip") {
                  console.log(`[v0] Línea ${lineNumber}: SKU ${sku} existe, saltando (modo skip)`)
                  return
                }

                console.log(`[v0] Línea ${lineNumber}: Intentando actualizar producto ${sku}`)
                console.log(`[v0] Línea ${lineNumber}: Datos a actualizar:`, JSON.stringify(productData, null, 2))

                const { error: updateError } = await supabase
                  .from("products")
                  .update(productData)
                  .eq("id", existingProduct.id)

                if (updateError) {
                  console.error(`[v0] Línea ${lineNumber}: ❌ ERROR actualizando ${sku}:`, {
                    message: updateError.message,
                    details: updateError.details,
                    hint: updateError.hint,
                    code: updateError.code,
                  })
                  failed++
                  if (errorsList.length < 5) {
                    errorsList.push({
                      sku,
                      message: updateError.message,
                      details: `${updateError.details || ""} ${updateError.hint || ""}`.trim() || "Error al actualizar",
                    })
                  }
                } else {
                  console.log(`[v0] Línea ${lineNumber}: ✅ Producto ${sku} actualizado exitosamente`)
                  updated++
                }
              } else {
                if (hasOnlyBasicData) {
                  console.log(`[v0] Línea ${lineNumber}: ⚠️ SKU ${sku} no existe - Buscando en fuentes principales...`)

                  try {
                    const { data: primarySources } = await supabase
                      .from("import_sources")
                      .select("*")
                      .or("name.ilike.%Arnoia%,name.ilike.%Arnoia Act%")
                      .order("name", { ascending: true }) // "Arnoia" viene antes que "Arnoia Act" alfabéticamente

                    let productFound = false
                    const sourcesToSearch = primarySources || []

                    // Ordenar para asegurar que "Arnoia" (sin "Act") se busque primero
                    sourcesToSearch.sort((a, b) => {
                      const aIsArnoia = a.name.toLowerCase().includes("arnoia") && !a.name.toLowerCase().includes("act")
                      const bIsArnoia = b.name.toLowerCase().includes("arnoia") && !b.name.toLowerCase().includes("act")
                      if (aIsArnoia && !bIsArnoia) return -1
                      if (!aIsArnoia && bIsArnoia) return 1
                      return 0
                    })

                    console.log(
                      `[v0] Línea ${lineNumber}: Fuentes encontradas para búsqueda:`,
                      sourcesToSearch.map((s) => s.name),
                    )

                    // Buscar en cada fuente hasta encontrar el producto
                    for (const primarySource of sourcesToSearch) {
                      if (productFound) break

                      if (!primarySource.url_template) {
                        console.log(`[v0] Línea ${lineNumber}: Fuente "${primarySource.name}" no tiene URL, saltando`)
                        continue
                      }

                      console.log(
                        `[v0] Línea ${lineNumber}: Buscando en fuente "${primarySource.name}", descargando CSV desde:`,
                        primarySource.url_template,
                      )

                      try {
                        // Descargar el CSV de la fuente
                        const primaryCsvResponse = await fetch(primarySource.url_template)
                        if (!primaryCsvResponse.ok) {
                          console.error(
                            `[v0] Línea ${lineNumber}: Error descargando CSV de "${primarySource.name}":`,
                            primaryCsvResponse.statusText,
                          )
                          continue
                        }

                        const primaryCsvText = await primaryCsvResponse.text()
                        const primaryLines = primaryCsvText.split("\n").filter((line) => line.trim())
                        const primaryFirstLine = primaryLines[0]

                        // Detectar separador del CSV
                        const primarySeparators = ["|", ";", ",", "\t"]
                        const primarySeparatorCounts = primarySeparators.map((sep) => ({
                          separator: sep,
                          count: (primaryFirstLine.match(new RegExp(`\\${sep}`, "g")) || []).length,
                        }))
                        const primaryDetectedSeparator = primarySeparatorCounts.reduce((max, current) =>
                          current.count > max.count ? current : max,
                        ).separator

                        const primaryHeaders = primaryFirstLine
                          .split(primaryDetectedSeparator)
                          .map((h) => h.trim().replace(/^"|"$/g, ""))

                        // Detectar columnas automáticamente
                        const primaryColumnMapping = {
                          sku:
                            primaryHeaders.find((h) => /^(sku|codigo|cod|referencia|ref|code|id)$/i.test(h.trim())) ||
                            primarySource.column_mapping.sku,
                          title:
                            primaryHeaders.find((h) =>
                              /^(nombre|name|titulo|title|descripcion|description|producto|product)$/i.test(h.trim()),
                            ) ||
                            primarySource.column_mapping.title ||
                            primarySource.column_mapping.name,
                          price:
                            primaryHeaders.find((h) => /^(precio|price|pvp|cost|costo)$/i.test(h.trim())) ||
                            primarySource.column_mapping.price,
                          stock:
                            primaryHeaders.find((h) =>
                              /^(stock|cantidad|quantity|existencia|disponible)$/i.test(h.trim()),
                            ) || primarySource.column_mapping.stock,
                          description:
                            primaryHeaders.find((h) =>
                              /^(descripcion|description|desc|detalle|sinopsis)$/i.test(h.trim()),
                            ) || primarySource.column_mapping.description,
                          category:
                            primaryHeaders.find((h) =>
                              /^(categoria|category|cat|tipo|type|familia|materia)$/i.test(h.trim()),
                            ) || primarySource.column_mapping.category,
                          brand:
                            primaryHeaders.find((h) =>
                              /^(marca|brand|fabricante|manufacturer|autor|editorial)$/i.test(h.trim()),
                            ) || primarySource.column_mapping.brand,
                        }

                        console.log(
                          `[v0] Línea ${lineNumber}: Columnas de "${primarySource.name}":`,
                          primaryHeaders,
                          "Mapeo:",
                          primaryColumnMapping,
                        )

                        // Buscar el SKU en el CSV
                        for (let primaryLineIndex = 1; primaryLineIndex < primaryLines.length; primaryLineIndex++) {
                          const primaryLine = primaryLines[primaryLineIndex]
                          const primaryValues = primaryLine
                            .split(primaryDetectedSeparator)
                            .map((v) => v.trim().replace(/^"|"$/g, ""))
                          const primaryRow: Record<string, string> = {}
                          primaryHeaders.forEach((header, index) => {
                            primaryRow[header] = primaryValues[index] || ""
                          })

                          const primarySku = primaryRow[primaryColumnMapping.sku]
                          if (primarySku === sku) {
                            // ¡Encontramos el producto!
                            console.log(`[v0] Línea ${lineNumber}: ✅ SKU ${sku} encontrado en "${primarySource.name}"`)

                            const completeProductData: any = {
                              sku,
                              source: [source.id, primarySource.id], // Incluir ambas fuentes
                            }

                            // Importar TODOS los datos disponibles de la fuente
                            if (primaryColumnMapping.title && primaryRow[primaryColumnMapping.title]) {
                              completeProductData.title = primaryRow[primaryColumnMapping.title]
                            }
                            if (primaryColumnMapping.description && primaryRow[primaryColumnMapping.description]) {
                              completeProductData.description = primaryRow[primaryColumnMapping.description]
                            }
                            if (primaryColumnMapping.category && primaryRow[primaryColumnMapping.category]) {
                              completeProductData.category = primaryRow[primaryColumnMapping.category]
                            }
                            if (primaryColumnMapping.brand && primaryRow[primaryColumnMapping.brand]) {
                              completeProductData.brand = primaryRow[primaryColumnMapping.brand]
                            }

                            // Usar precio y stock de la fuente actual que es más reciente
                            if (columnMapping.price && row[columnMapping.price]) {
                              completeProductData.price =
                                Number.parseFloat(row[columnMapping.price].replace(",", ".")) || 0
                            } else if (primaryColumnMapping.price && primaryRow[primaryColumnMapping.price]) {
                              completeProductData.price =
                                Number.parseFloat(primaryRow[primaryColumnMapping.price].replace(",", ".")) || 0
                            }

                            if (columnMapping.stock && row[columnMapping.stock]) {
                              completeProductData.stock = Number.parseInt(row[columnMapping.stock]) || 0
                            } else if (primaryColumnMapping.stock && primaryRow[primaryColumnMapping.stock]) {
                              completeProductData.stock = Number.parseInt(primaryRow[primaryColumnMapping.stock]) || 0
                            }

                            console.log(
                              `[v0] Línea ${lineNumber}: Datos completos a importar desde "${primarySource.name}":`,
                              JSON.stringify(completeProductData, null, 2),
                            )

                            // Insertar el producto completo
                            const { error: insertError } = await supabase.from("products").insert(completeProductData)

                            if (insertError) {
                              console.error(
                                `[v0] Línea ${lineNumber}: ❌ ERROR insertando ${sku} desde "${primarySource.name}":`,
                                {
                                  message: insertError.message,
                                  details: insertError.details,
                                  hint: insertError.hint,
                                  code: insertError.code,
                                },
                              )
                              failed++
                              if (errorsList.length < 5) {
                                errorsList.push({
                                  sku,
                                  message: insertError.message,
                                  details:
                                    `${insertError.details || ""} ${insertError.hint || ""}`.trim() ||
                                    `Error al insertar desde "${primarySource.name}"`,
                                })
                              }
                            } else {
                              console.log(
                                `[v0] Línea ${lineNumber}: ✅ Producto ${sku} importado exitosamente desde "${primarySource.name}" con todos los datos`,
                              )
                              imported++
                            }

                            productFound = true
                            break
                          }
                        }

                        if (productFound) {
                          console.log(
                            `[v0] Línea ${lineNumber}: Producto encontrado en "${primarySource.name}", deteniendo búsqueda`,
                          )
                          break
                        } else {
                          console.log(
                            `[v0] Línea ${lineNumber}: Producto no encontrado en "${primarySource.name}", continuando búsqueda...`,
                          )
                        }
                      } catch (fetchError: any) {
                        console.error(
                          `[v0] Línea ${lineNumber}: Error procesando fuente "${primarySource.name}":`,
                          fetchError.message,
                        )
                        continue
                      }
                    }

                    if (!productFound) {
                      console.log(
                        `[v0] Línea ${lineNumber}: ⚠️ SKU ${sku} no encontrado en ninguna fuente principal - SALTANDO`,
                      )
                      skipped++
                      if (missingProducts.length < 10) {
                        missingProducts.push(sku)
                      }
                      if (errorsList.length < 5) {
                        errorsList.push({
                          sku,
                          message: "Producto no encontrado en ninguna fuente",
                          details:
                            "El producto no existe en la base de datos ni en las fuentes principales 'Arnoia' o 'Arnoia Act'. Verifique el SKU.",
                        })
                      }
                    }
                  } catch (primarySourceError: any) {
                    console.error(
                      `[v0] Línea ${lineNumber}: ❌ ERROR buscando en fuentes principales:`,
                      primarySourceError,
                    )
                    skipped++
                    if (missingProducts.length < 10) {
                      missingProducts.push(sku)
                    }
                    if (errorsList.length < 5) {
                      errorsList.push({
                        sku,
                        message: "Error al buscar en fuentes principales",
                        details: primarySourceError.message || "Error desconocido al consultar fuentes principales",
                      })
                    }
                  }

                  return
                }

                // Si no es hasOnlyBasicData, entonces es un producto nuevo y se inserta con los datos disponibles
                console.log(
                  `[v0] Línea ${lineNumber}: ⚠️ SKU ${sku} no existe, procediendo a insertar como nuevo producto`,
                )
                console.log(`[v0] Línea ${lineNumber}: Datos a insertar:`, JSON.stringify(productData, null, 2))

                const { error: insertError } = await supabase.from("products").insert(productData)

                if (insertError) {
                  console.error(`[v0] Línea ${lineNumber}: ❌ ERROR insertando ${sku}:`, {
                    message: insertError.message,
                    details: insertError.details,
                    hint: insertError.hint,
                    code: insertError.code,
                  })
                  failed++
                  if (errorsList.length < 5) {
                    errorsList.push({
                      sku,
                      message: insertError.message,
                      details: `${insertError.details || ""} ${insertError.hint || ""}`.trim() || "Error al insertar",
                    })
                  }
                } else {
                  console.log(`[v0] Línea ${lineNumber}: ✅ Producto ${sku} importado exitosamente`)
                  imported++
                }
              }
            } catch (error: any) {
              console.error(`[v0] Línea ${lineNumber}: ❌ ERROR GENERAL procesando:`, error)
              failed++
              if (errorsList.length < 5) {
                errorsList.push({
                  sku: `Línea ${lineNumber}`,
                  message: error.message || "Error desconocido",
                  details: error.stack || "Sin detalles adicionales",
                })
              }
            }
          }),
        )

        const processed = i + batch.length - 1
        const elapsedSeconds = (new Date().getTime() - now.getTime()) / 1000
        const speed = elapsedSeconds > 0 ? processed / elapsedSeconds : 0

        setImportProgress({
          total: totalProducts,
          processed,
          imported,
          updated,
          failed,
          status: "running",
          startTime: now,
          lastUpdate: new Date(),
          speed: Math.round(speed * 10) / 10,
          errors: errorsList,
        })

        console.log(`[v0] Progreso: ${processed}/${totalProducts} (${Math.round((processed / totalProducts) * 100)}%)`)
      }

      if (skipped > 0) {
        console.log("[v0] ⚠️ ADVERTENCIA: Se saltaron", skipped, "productos que no existen en la base de datos")
        console.log("[v0] Primeros SKUs faltantes:", missingProducts.slice(0, 10).join(", "))

        toast({
          title: "⚠️ Productos no encontrados",
          description: `${skipped} productos no existen en la base de datos. Solo se pueden actualizar productos existentes con esta importación.`,
          variant: "destructive",
        })
      }

      if (historyData) {
        await supabase
          .from("import_history")
          .update({
            status: "success",
            completed_at: new Date().toISOString(),
            products_imported: imported,
            products_updated: updated,
            products_failed: failed,
          })
          .eq("id", historyData.id)
      }

      console.log("[v0] ===== IMPORTACIÓN COMPLETADA =====")
      console.log("[v0] Importados:", imported)
      console.log("[v0] Actualizados:", updated)
      console.log("[v0] Fallidos:", failed)
      console.log("[v0] Saltados (no existen):", skipped)

      setImportProgress({
        total: totalProducts,
        processed: totalProducts,
        imported,
        updated,
        failed,
        status: "completed",
        startTime: now,
        lastUpdate: new Date(),
        speed: totalProducts / ((new Date().getTime() - now.getTime()) / 1000),
        errors: errorsList,
      })

      toast({
        title: "Importación completada",
        description: `${imported} productos importados, ${updated} actualizados${skipped > 0 ? `, ${skipped} saltados (no existen)` : ""}`,
      })

      loadSources()
      checkRunningImports()
    } catch (error: any) {
      console.error("[v0] ===== ERROR EN IMPORTACIÓN =====")
      console.error("[v0] Error:", error)
      console.error("[v0] Error stack:", error.stack)
      console.error("[v0] Error message:", error.message)
      setImportProgress((prev) => ({ ...prev, status: "error" }))
      toast({
        title: "Error",
        description: error.message || "No se pudo ejecutar la importación",
        variant: "destructive",
      })
      // Asegurarse de que el historial se marque como error si algo falla catastróficamente
      if (currentImportHistoryId) {
        await supabase
          .from("import_history")
          .update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_message: error.message,
          })
          .eq("id", currentImportHistoryId)
      }
    } finally {
      setImporting(null)
      setShowImportConfirmDialog(false)
      setSourceToImport(null)
    }
  }

  async function handleQuickDisableSchedule(source: SourceWithSchedule) {
    if (source.schedules.length === 0) return

    try {
      const schedule = source.schedules[0]
      const [hourNum, minuteNum] = [schedule.hour, schedule.minute || 0]

      const response = await fetch(`/api/inventory/sources/${source.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          frequency: schedule.frequency,
          timezone: schedule.timezone,
          hour: hourNum,
          minute: minuteNum,
          dayOfWeek: schedule.day_of_week,
          dayOfMonth: schedule.day_of_month,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al desactivar el cronjob")
      }

      toast({
        title: "Cronjob desactivado",
        description: "La importación automática ha sido desactivada",
      })

      loadSources()
    } catch (error: any) {
      console.error("[v0] Error disabling schedule:", error)
      toast({
        title: "Error",
        description: error.message || "No se pudo desactivar el cronjob",
        variant: "destructive",
      })
    }
  }

  async function handleDeleteSource() {
    if (!selectedSource) return

    try {
      // Eliminar programaciones
      await supabase.from("import_schedules").delete().eq("source_id", selectedSource.id)

      // Eliminar fuente
      const { error } = await supabase.from("import_sources").delete().eq("id", selectedSource.id)

      if (error) throw error

      toast({
        title: "Fuente eliminada",
        description: "La fuente de importación ha sido eliminada",
      })

      setShowDeleteDialog(false)
      setSelectedSource(null)
      loadSources()
    } catch (error) {
      console.error("Error deleting source:", error)
      toast({
        title: "Error",
        description: "No se pudo eliminar la fuente",
        variant: "destructive",
      })
    }
  }

  function handleOpenScheduleDialog(source: SourceWithSchedule) {
    if (!schedulesTableExists) {
      toast({
        title: "Funcionalidad no disponible",
        description: "Debes ejecutar el script SQL 017_create_import_schedules.sql para habilitar los cronjobs",
        variant: "destructive",
      })
      return
    }

    setSelectedSource(source)

    const schedule = source.schedules[0]
    if (schedule) {
      const hourStr = String(schedule.hour || 0).padStart(2, "0")
      const minuteStr = String(schedule.minute || 0).padStart(2, "0")

      setScheduleConfig({
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        timezone: schedule.timezone,
        hour: `${hourStr}:${minuteStr}`,
        dayOfWeek: schedule.day_of_week ?? 1,
        dayOfMonth: schedule.day_of_month ?? 1,
      })
    } else {
      setScheduleConfig({
        enabled: false,
        frequency: "daily",
        timezone: "America/Argentina/Buenos_Aires",
        hour: "00:00",
        dayOfWeek: 1,
        dayOfMonth: 1,
      })
    }

    setShowScheduleDialog(true)
  }

  async function handleSaveSchedule() {
    if (!selectedSource) return

    try {
      console.log("[v0] Guardando schedule:", {
        sourceId: selectedSource.id,
        config: scheduleConfig,
      })

      const [hourNum, minuteNum] = scheduleConfig.hour.split(":").map(Number)

      const response = await fetch(`/api/inventory/sources/${selectedSource.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: scheduleConfig.enabled,
          frequency: scheduleConfig.frequency,
          timezone: scheduleConfig.timezone,
          hour: hourNum,
          minute: minuteNum,
          dayOfWeek: scheduleConfig.frequency === "weekly" ? scheduleConfig.dayOfWeek : null,
          dayOfMonth: scheduleConfig.frequency === "monthly" ? scheduleConfig.dayOfMonth : null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al guardar la configuración")
      }

      const result = await response.json()
      console.log("[v0] Schedule guardado exitosamente:", result)

      toast({
        title: "Configuración guardada",
        description: "La configuración del cronjob ha sido guardada correctamente",
      })

      setShowScheduleDialog(false)

      setTimeout(() => {
        console.log("[v0] Recargando fuentes después de guardar schedule...")
        loadSources()
      }, 500)
    } catch (error: any) {
      console.error("[v0] Error saving schedule:", error)
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la configuración del cronjob",
        variant: "destructive",
      })
    }
  }

  async function handleCancelImport(sourceId: string) {
    // Buscar el ID del historial de importación asociado a la fuente que está corriendo
    let historyIdToCancel = null
    try {
      const { data: runningHistory } = await supabase
        .from("import_history")
        .select("id")
        .eq("source_id", sourceId)
        .eq("status", "running")
        .maybeSingle() // Usar maybeSingle ya que solo esperamos una importación 'running' por fuente

      if (runningHistory) {
        historyIdToCancel = runningHistory.id
      } else {
        // Si no se encuentra un historial 'running', puede ser que el estado no se haya actualizado todavía
        // o que ya haya terminado pero no se ha refrescado la lista.
        // Intentamos usar el currentImportHistoryId si está definido y es para la misma fuente.
        if (currentImportHistoryId && sourceId === sourceToImport?.id) {
          historyIdToCancel = currentImportHistoryId
        }
      }

      if (!historyIdToCancel) {
        console.log(`[v0] No se encontró un historial de importación activo para cancelar para la fuente ${sourceId}`)
        // Podríamos actualizar la UI para indicar que no hay nada que cancelar o simplemente no hacer nada.
        // Toast aquí podría ser confuso si el usuario ya está viendo el progreso.
        toast({
          title: "Nada que cancelar",
          description: "No se encontró una importación activa para cancelar.",
          variant: "secondary",
        })
        return
      }

      console.log(`[v0] Iniciando cancelación para historyId: ${historyIdToCancel} (sourceId: ${sourceId})`)

      const response = await fetch("/api/inventory/import/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId: historyIdToCancel }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al cancelar importación")
      }

      toast({
        title: "Cancelando importación",
        description: "La importación se detendrá en breve...",
      })

      // Forzar una actualización para reflejar el estado "cancelled" si es necesario
      // checkRunningImports() // Esto ya debería manejarse por el polling y loadSources.
      // Si el cancelar falla, el toast ya lo indicará.
      // Si el cancelar tiene éxito, el polling eventually actualizará el estado.
      // Se puede llamar a loadSources() para asegurar la actualización visual de las listas.
      // Dar un pequeño delay para que la API termine de procesar la cancelación antes de recargar
      setTimeout(() => {
        loadSources()
        checkRunningImports() // Re-verificar el estado de las importaciones
      }, 1500) // 1.5 segundos de delay
    } catch (error: any) {
      console.error("[v0] Error cancelling import:", error)
      toast({
        title: "Error",
        description: error.message || "No se pudo cancelar la importación",
        variant: "destructive",
      })
    }
  }

  async function checkRunningImports() {
    try {
      const { data: runningHistory } = await supabase
        .from("import_history")
        .select("id, source_id")
        .eq("status", "running")

      if (runningHistory && runningHistory.length > 0) {
        const newRunningImports = new Map<string, string>()
        runningHistory.forEach((h) => {
          newRunningImports.set(h.source_id, h.id)
        })
        setRunningImports(newRunningImports)
      } else {
        setRunningImports(new Map())
      }
    } catch (error) {
      console.error("[v0] Error checking running imports:", error)
    }
  }

  function handleReopenImportDialog(sourceId: string) {
    const backgroundImport = backgroundImports.get(sourceId)
    if (backgroundImport) {
      const source = sources.find((s) => s.id === sourceId)
      if (source) {
        setSourceToImport(source)
        setImportProgress(backgroundImport)
        setShowProgressDialog(true)
        console.log("[v0] Modal de importación recuperado para:", source.name)
      }
    }
  }

  // Esta función ya no es necesaria ya que el progreso se actualiza vía polling desde executeImport
  // async function updateImportProgress() {
  //   if (!currentImportHistoryId || !showProgressDialog) return

  //   try {
  //     const { data: history } = await supabase
  //       .from("import_history")
  //       .select("status, products_imported, products_updated, products_failed")
  //       .eq("id", currentImportHistoryId)
  //       .single()

  //     if (history) {
  //       const now = new Date()
  //       const processed =
  //         (history.products_imported || 0) + (history.products_updated || 0) + (history.products_failed || 0)

  //       setImportProgress((prev) => {
  //         const elapsedSeconds = prev.startTime ? (now.getTime() - prev.startTime.getTime()) / 1000 : 0
  //         const speed = elapsedSeconds > 0 ? processed / elapsedSeconds : 0

  //         return {
  //           ...prev,
  //           imported: history.products_imported || 0,
  //           updated: history.products_updated || 0,
  //           failed: history.products_failed || 0,
  //           processed,
  //           lastUpdate: now,
  //           speed: Math.round(speed * 10) / 10, // Redondear a 1 decimal
  //           status:
  //             history.status === "running"
  //               ? "running"
  //               : history.status === "success"
  //                 ? "completed"
  //                 : history.status === "cancelled"
  //                   ? "cancelled"
  //                   : "error",
  //         }
  //       })
  //     }
  //   } catch (error) {
  //     console.error("[v0] Error updating import progress:", error)
  //   }
  // }

  function getFrequencyLabel(frequency: string) {
    const labels: Record<string, string> = {
      once: "Una vez",
      hourly: "Cada hora",
      daily: "Diario",
      weekly: "Semanal",
      monthly: "Mensual",
    }
    return labels[frequency] || frequency
  }

  function toggleSourceExpansion(sourceId: string) {
    setExpandedSources((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(sourceId)) {
        newSet.delete(sourceId)
      } else {
        newSet.add(sourceId)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando fuentes...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestor de Importaciones</h1>
          <p className="text-muted-foreground mt-1">Administra tus fuentes de importación y sus configuraciones</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (window.location.href = "/import-sources")}>
            <Upload className="h-4 w-4 mr-2" />
            Nueva Fuente
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/inventory")}>
            Volver a Inventario
          </Button>
        </div>
      </div>

      {sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">No hay fuentes de importación configuradas</p>
            <Button className="mt-4" onClick={() => (window.location.href = "/import-sources")}>
              <Upload className="h-4 w-4 mr-2" />
              Crear Nueva Fuente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => {
            const isExpanded = expandedSources.has(source.id)
            const isRunning = runningImports.has(source.id)

            return (
              <Card key={source.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{source.name}</CardTitle>
                      {source.description && <CardDescription className="mt-1">{source.description}</CardDescription>}
                    </div>
                    <Badge variant="outline">{source.feed_type}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  {backgroundImports.has(source.id) && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            Importación en progreso
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleReopenImportDialog(source.id)}>
                          Ver progreso
                        </Button>
                      </div>
                      {(() => {
                        const bg = backgroundImports.get(source.id)
                        if (bg && bg.total > 0) {
                          return (
                            <div className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                              {bg.processed} / {bg.total} productos ({Math.round((bg.processed / bg.total) * 100)}%)
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  )}
                  <div className="space-y-2">
                    <button
                      onClick={() => toggleSourceExpansion(source.id)}
                      className="flex items-center justify-between w-full text-sm font-medium hover:text-primary transition-colors"
                    >
                      <span>Configuración</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {isExpanded && (
                      <div className="text-sm text-muted-foreground space-y-1 pt-2">
                        {source.url_template && (
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div className="break-all">{source.url_template}</div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 flex-shrink-0" />
                          <div>{Object.keys(source.column_mapping || {}).length} columnas mapeadas</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 flex-shrink-0" />
                          <div>
                            {source.overwrite_duplicates ? "Sobrescribir duplicados" : "No sobrescribir duplicados"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {source.schedules.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Programación:</div>
                      <div className="space-y-2">
                        {source.schedules.map((schedule) => (
                          <div key={schedule.id} className="text-sm p-3 bg-muted rounded-md space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span className="font-medium">{getFrequencyLabel(schedule.frequency)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={schedule.enabled ? "default" : "secondary"}>
                                  {schedule.enabled ? "Activa" : "Inactiva"}
                                </Badge>
                                {schedule.enabled && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleQuickDisableSchedule(source)}
                                    title="Desactivar cronjob"
                                  >
                                    Desactivar
                                  </Button>
                                )}
                              </div>
                            </div>
                            {schedule.enabled && (
                              <div className="space-y-1 text-muted-foreground pl-6">
                                <div className="flex items-center gap-2">
                                  <span>
                                    Hora: {String(schedule.hour).padStart(2, "0")}:
                                    {String(schedule.minute || 0).padStart(2, "0")} - {schedule.timezone}
                                  </span>
                                </div>
                                {schedule.next_run_at && (
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-3 w-3" />
                                    <span>
                                      Próxima:{" "}
                                      {new Date(schedule.next_run_at).toLocaleString("es-AR", {
                                        timeZone: schedule.timezone,
                                        year: "numeric",
                                        month: "2-digit",
                                        day: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Última importación:</div>
                    {source.last_import ? (
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(source.last_import.started_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              source.last_import.status === "success"
                                ? "default"
                                : source.last_import.status === "error"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {source.last_import.status}
                          </Badge>
                          <span>
                            {source.last_import.products_imported} importados, {source.last_import.products_updated}{" "}
                            actualizados
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Nunca ejecutada</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      className="flex-1"
                      onClick={() => handleRunImport(source)}
                      disabled={importing === source.id || backgroundImports.has(source.id)}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {importing === source.id || backgroundImports.has(source.id) ? "Importando..." : "Ejecutar"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleOpenScheduleDialog(source)}
                      title={
                        schedulesTableExists ? "Configurar cronjob" : "Cronjobs no disponibles (ejecuta script SQL 017)"
                      }
                      disabled={!schedulesTableExists}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Cronjob
                    </Button>
                    <Link href={`/inventory/sources/${source.id}/history`}>
                      <Button variant="outline" size="icon" title="Ver historial">
                        <History className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setSelectedSource(source)
                        setShowDeleteDialog(true)
                      }}
                      title="Eliminar fuente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Fuente</DialogTitle>
            <DialogDescription>¿Estás seguro de que quieres eliminar esta fuente?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDeleteSource} variant="destructive">
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Cronjob</DialogTitle>
            <DialogDescription>Configura la ejecución automática de esta importación</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Activar cronjob</Label>
              <Switch
                id="enabled"
                checked={scheduleConfig.enabled}
                onCheckedChange={(checked) => setScheduleConfig({ ...scheduleConfig, enabled: checked })}
              />
            </div>

            {scheduleConfig.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frecuencia</Label>
                  <Select
                    value={scheduleConfig.frequency}
                    onValueChange={(value) => setScheduleConfig({ ...scheduleConfig, frequency: value })}
                  >
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Cada hora</SelectItem>
                      <SelectItem value="daily">Diario</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Zona horaria</Label>
                  <Select
                    value={scheduleConfig.timezone}
                    onValueChange={(value) => setScheduleConfig({ ...scheduleConfig, timezone: value })}
                  >
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Argentina/Buenos_Aires">Buenos Aires (GMT-3)</SelectItem>
                      <SelectItem value="America/New_York">New York (GMT-5)</SelectItem>
                      <SelectItem value="Europe/Madrid">Madrid (GMT+1)</SelectItem>
                      <SelectItem value="UTC">UTC (GMT+0)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hour">Hora de ejecución</Label>
                  <Input
                    id="hour"
                    type="time"
                    value={scheduleConfig.hour}
                    onChange={(e) => setScheduleConfig({ ...scheduleConfig, hour: e.target.value })}
                  />
                </div>

                {scheduleConfig.frequency === "weekly" && (
                  <div className="space-y-2">
                    <Label htmlFor="dayOfWeek">Día de la Semana</Label>
                    <Select
                      value={String(scheduleConfig.dayOfWeek)}
                      onValueChange={(value) => setScheduleConfig({ ...scheduleConfig, dayOfWeek: Number(value) })}
                    >
                      <SelectTrigger id="dayOfWeek">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Domingo</SelectItem>
                        <SelectItem value="1">Lunes</SelectItem>
                        <SelectItem value="2">Martes</SelectItem>
                        <SelectItem value="3">Miércoles</SelectItem>
                        <SelectItem value="4">Jueves</SelectItem>
                        <SelectItem value="5">Viernes</SelectItem>
                        <SelectItem value="6">Sábado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {scheduleConfig.frequency === "monthly" && (
                  <div className="space-y-2">
                    <Label htmlFor="dayOfMonth">Día del Mes</Label>
                    <Select
                      value={String(scheduleConfig.dayOfMonth)}
                      onValueChange={(value) => setScheduleConfig({ ...scheduleConfig, dayOfMonth: Number(value) })}
                    >
                      <SelectTrigger id="dayOfMonth">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            Día {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedSource?.schedules[0]?.last_run_at && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        Última ejecución: {new Date(selectedSource.schedules[0].last_run_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSchedule}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportConfirmDialog} onOpenChange={setShowImportConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Importación</DialogTitle>
            <DialogDescription>Selecciona cómo deseas manejar los productos con SKU duplicado</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {sourceToImport && (
              <div className="text-sm space-y-2 pb-4 border-b">
                <div>
                  <strong>Fuente:</strong> {sourceToImport.name}
                </div>
                <div>
                  <strong>Tipo:</strong> {sourceToImport.feed_type}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-base font-semibold">Modo de importación:</Label>

              <div className="space-y-3">
                {/* Opción 1: Actualizar datos (por defecto) */}
                <div
                  className={`flex items-start space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    importMode === "update" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                  }`}
                  onClick={() => setImportMode("update")}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value="update"
                    checked={importMode === "update"}
                    onChange={(e) => setImportMode(e.target.value as any)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">Actualizar datos (Recomendado)</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Solo actualiza los campos que vienen en la importación. Preserva personalizaciones como
                      descripciones e imágenes.
                    </div>
                  </div>
                </div>

                {/* Opción 2: Saltar repetidos */}
                <div
                  className={`flex items-start space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    importMode === "skip" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                  }`}
                  onClick={() => setImportMode("skip")}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value="skip"
                    checked={importMode === "skip"}
                    onChange={(e) => setImportMode(e.target.value as any)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">Saltar repetidos</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Solo importa productos nuevos. Los productos con SKU existente no se modifican.
                    </div>
                  </div>
                </div>

                {/* Opción 3: Sobrescribir todo */}
                <div
                  className={`flex items-start space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    importMode === "overwrite"
                      ? "border-destructive bg-destructive/5"
                      : "border-muted hover:border-destructive/50"
                  }`}
                  onClick={() => setImportMode("overwrite")}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value="overwrite"
                    checked={importMode === "overwrite"}
                    onChange={(e) => setImportMode(e.target.value as any)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-destructive">⚠️ Sobrescribir todo</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Reemplaza completamente los productos existentes. Se perderán todas las personalizaciones.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {importMode === "overwrite" && (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Advertencia:</strong> Esta opción sobrescribirá completamente los productos existentes,
                  incluyendo descripciones, imágenes y otros campos personalizados.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportConfirmDialog(false)
                setSourceToImport(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (sourceToImport) {
                  executeImport(sourceToImport)
                }
              }}
              variant={importMode === "overwrite" ? "destructive" : "default"}
            >
              {importMode === "overwrite" ? "Sobrescribir Todo" : "Continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showProgressDialog}
        onOpenChange={(open) => {
          if (!open) {
            // Si hay una importación en progreso, moverla a segundo plano
            if (importProgress.status === "running" && sourceToImport) {
              console.log("[v0] Moviendo importación a segundo plano:", sourceToImport.name)
              setBackgroundImports((prev) => new Map(prev).set(sourceToImport.id, { ...importProgress }))
              toast({
                title: "Importación en segundo plano",
                description: `La importación de "${sourceToImport.name}" continúa ejecutándose. Haz clic en "Ver progreso" para reabrir el modal.`,
              })
            }
            setShowProgressDialog(false)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {importProgress.status === "running" && "⏳ Importación en Curso"}
              {importProgress.status === "completed" && "✅ Importación Completada"}
              {importProgress.status === "cancelled" && "⚠️ Importación Cancelada"}
              {importProgress.status === "error" && "❌ Error en Importación"}
            </DialogTitle>
            <DialogDescription>
              {importProgress.status === "running" && "Procesando productos..."}
              {importProgress.status === "completed" && "La importación se completó exitosamente"}
              {importProgress.status === "cancelled" && "La importación fue cancelada"}
              {importProgress.status === "error" && "Ocurrió un error durante la importación"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {importProgress.status === "running" && (
              <div className="flex items-center justify-between text-sm bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                  <span className="text-blue-800 dark:text-blue-200 font-medium">Procesando activamente...</span>
                </div>
                {importProgress.lastUpdate && (
                  <span className="text-xs text-blue-600 dark:text-blue-300">
                    {new Date(importProgress.lastUpdate).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}

            {/* Barra de progreso */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso</span>
                <span className="font-medium">
                  {importProgress.processed} / {importProgress.total > 0 ? importProgress.total : "?"}
                  {importProgress.total > 0 && (
                    <span className="text-muted-foreground ml-1">
                      ({Math.round((importProgress.processed / importProgress.total) * 100)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    importProgress.status === "running"
                      ? "bg-blue-600 animate-pulse"
                      : importProgress.status === "completed"
                        ? "bg-green-600"
                        : importProgress.status === "cancelled"
                          ? "bg-yellow-600"
                          : "bg-red-600"
                  }`}
                  style={{
                    width: `${importProgress.total > 0 ? (importProgress.processed / importProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {importProgress.startTime && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-muted-foreground">Tiempo transcurrido</div>
                  <div className="font-medium">
                    {(() => {
                      const elapsedSeconds = Math.floor(
                        (new Date().getTime() - importProgress.startTime.getTime()) / 1000,
                      )
                      const hours = Math.floor(elapsedSeconds / 3600)
                      const minutes = Math.floor((elapsedSeconds % 3600) / 60)
                      const seconds = elapsedSeconds % 60

                      if (hours > 0) {
                        return `${hours}h ${minutes}m ${seconds}s`
                      } else if (minutes > 0) {
                        return `${minutes}m ${seconds}s`
                      } else {
                        return `${seconds}s`
                      }
                    })()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Velocidad</div>
                  <div className="font-medium">{importProgress.speed} prod/s</div>
                </div>
              </div>
            )}

            {/* Estadísticas */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="space-y-1">
                <div className="text-2xl font-bold text-green-600">{importProgress.imported}</div>
                <div className="text-xs text-muted-foreground">Importados</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-blue-600">{importProgress.updated}</div>
                <div className="text-xs text-muted-foreground">Actualizados</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-red-600">{importProgress.failed}</div>
                <div className="text-xs text-muted-foreground">Fallidos</div>
              </div>
            </div>

            {/* Mensaje de estado */}
            {importProgress.status === "running" && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {importProgress.speed > 0 && importProgress.total > importProgress.processed && (
                    <>
                      Tiempo estimado restante: {(() => {
                        const remainingSeconds = Math.round(
                          (importProgress.total - importProgress.processed) / importProgress.speed,
                        )
                        const hours = Math.floor(remainingSeconds / 3600)
                        const minutes = Math.floor((remainingSeconds % 3600) / 60)
                        const seconds = remainingSeconds % 60

                        if (hours > 0) {
                          return `${hours}h ${minutes}m ${seconds}s`
                        } else if (minutes > 0) {
                          return `${minutes}m ${seconds}s`
                        } else {
                          return `${seconds}s`
                        }
                      })()}
                    </>
                  )}
                  {importProgress.speed === 0 &&
                    importProgress.total === 0 &&
                    "Esperando información del total de productos..."}
                  {importProgress.speed === 0 && importProgress.total > 0 && "Iniciando procesamiento..."}
                </p>
              </div>
            )}

            {importProgress.errors.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-red-600">
                  Errores detectados ({importProgress.errors.length} de {importProgress.failed}):
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {importProgress.errors.map((error, index) => (
                    <div
                      key={index}
                      className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs"
                    >
                      <div className="font-medium text-red-800 dark:text-red-200">SKU: {error.sku}</div>
                      <div className="text-red-700 dark:text-red-300 mt-1">{error.message}</div>
                      {error.details && (
                        <div className="text-red-600 dark:text-red-400 mt-1 text-[10px]">{error.details}</div>
                      )}
                    </div>
                  ))}
                </div>
                {importProgress.failed > importProgress.errors.length && (
                  <div className="text-xs text-muted-foreground">
                    ... y {importProgress.failed - importProgress.errors.length} errores más
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {importProgress.status === "running" ? (
              <Button
                variant="destructive"
                onClick={() => {
                  // Pasamos el sourceId aquí, ya que el importId es el que se está gestionando
                  if (sourceToImport) {
                    handleCancelImport(sourceToImport.id)
                  }
                }}
              >
                <StopCircle className="h-4 w-4 mr-2" />
                Cancelar Importación
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setShowProgressDialog(false)
                  setCurrentImportHistoryId(null)
                  setSourceToImport(null)
                }}
              >
                Cerrar
              </Button>
            )}
          </DialogFooter>

          {importProgress.csvInfo && (
            <div className="border-t pt-4 mt-4">
              <details className="space-y-2">
                <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                  📋 Información del CSV (click para expandir)
                </summary>
                <div className="space-y-3 mt-3 text-xs">
                  <div>
                    <div className="font-medium mb-1">Columnas detectadas en el CSV:</div>
                    <div className="bg-muted p-2 rounded font-mono text-[10px] max-h-24 overflow-y-auto">
                      {importProgress.csvInfo.headers.join(", ")}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium mb-1">Mapeo de columnas usado:</div>
                    <div className="bg-muted p-2 rounded space-y-1">
                      {Object.entries(importProgress.csvInfo.columnMapping).map(([field, column]) => (
                        <div key={field} className="flex justify-between">
                          <span className="text-muted-foreground">{field}:</span>
                          <span className="font-mono font-medium">{column || "(no mapeado)"}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="font-medium mb-1">Primera fila de datos:</div>
                    <div className="bg-muted p-2 rounded font-mono text-[10px] max-h-32 overflow-y-auto space-y-1">
                      {Object.entries(importProgress.csvInfo.firstRow).map(([column, value]) => (
                        <div key={column} className="flex gap-2">
                          <span className="text-muted-foreground min-w-[100px]">{column}:</span>
                          <span className="break-all">{value || "(vacío)"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
