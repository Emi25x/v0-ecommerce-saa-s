"use client"

import { useCallback, useEffect, useState, useRef } from "react" // Importar useRef
import { createBrowserClient } from "@supabase/ssr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, FileText, Play, Settings, Trash2, Upload, History, CheckCircle2, ChevronDown, ChevronUp, StopCircle, Hourglass, X, Loader2, RefreshCw, Database, ExternalLink, ArrowRight, Copy, AlertTriangle, Search } from 'lucide-react' // Importar AlertTriangle y DollarSign
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
import Papa from "papaparse" // Importar PapaParse
import { useRouter } from 'next/navigation' // Importar useRouter

// Mover los hooks de estado al nivel superior del componente
const App = () => {
  // Envolver la lógica del componente en una función principal
  const [showDiagnosticDialog, setShowDiagnosticDialog] = useState(false)
  const [diagnosticData, setDiagnosticData] = useState<any>(null)
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false)
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState("")
  const [runningCron, setRunningCron] = useState(false)

  // Estado para el análisis de duplicados
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)

  // Función auxiliar para detectar el separador CSV
  function detectSeparator(text: string): string {
    const lines = text.split("\n")
    if (lines.length === 0) return ","

    const firstLine = lines[0]
    const separators = ["|", ";", ",", "\t"]
    let bestSeparator = ","
    let maxCount = 0

    for (const sep of separators) {
      const count = (firstLine.match(new RegExp(`\\${sep}`, "g")) || []).length
      if (count > maxCount) {
        maxCount = count
        bestSeparator = sep
      }
    }
    return bestSeparator
  }

  // Función auxiliar para crear cliente Supabase (reutilizada)
  async function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase URL and Anon Key must be set in environment variables.")
    }
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  const extractFieldValue = useCallback(
    (row: Record<string, any>, fieldName: string, mapping: Record<string, string>) => {
      // Primero intentar usar el mapeo configurado
      const mappedColumn = mapping[fieldName]
      if (mappedColumn && row[mappedColumn] !== undefined && row[mappedColumn] !== null && row[mappedColumn] !== "") {
        return row[mappedColumn]
      }

      const commonNames: Record<string, string[]> = {
        sku: ["sku", "codigo_interno", "codigo", "barcode", "upc"],
        ean: ["ean", "ean13", "isbn", "codigo_barras", "barcode"],
        title: ["title", "name", "titulo", "product", "nombre", "descripcion"],
        description: ["description", "descripcion", "detalle", "desc"],
        category: ["category", "categoria", "rubro", "cat"],
        brand: ["brand", "marca", "fabricante"],
        price: ["price", "precio", "pvp", "pventa", "precio_venta"],
        stock: ["stock", "quantity", "existencia", "qty", "cantidad"],
      }

      const possibleNames = commonNames[fieldName] || [fieldName]
      for (const possibleName of possibleNames) {
        if (row[possibleName] !== undefined && row[possibleName] !== null && row[possibleName] !== "") {
          return row[possibleName]
        }
      }

      return null
    },
    [],
  ) // extractFieldValue no depende de variables externas

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

  // Estado de progreso de importación
  interface ImportProgressState {
    total: number
    processed: number
    imported: number
    updated: number
    failed: number
    skipped: number // Agregar campo skipped
    status: "running" | "completed" | "cancelled" | "error"
    startTime: Date | null
    lastUpdate: Date | null
    speed: number
    errors: Array<{ sku: string; error: string; details?: string }> // details ahora es opcional
    csvInfo: null | {
      separator: string
      headers: string[]
      firstRow: Record<string, string>
    }
  }

  // Asegurarse de que useRouter se llame dentro del componente
  const router = useRouter()

  const [sources, setSources] = useState<SourceWithSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSource, setSelectedSource] = useState<SourceWithSchedule | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [runningImports, setRunningImports] = useState<Map<string, string>>(new Map())
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [schedulesTableExists, setSchedulesTableExists] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())
  const [showProgressDialog, setShowProgressDialog] = useState(false)
  const [backgroundImports, setBackgroundImports] = useState<Map<string, ImportProgressState>>(new Map())
  const [importProgress, setImportProgress] = useState<ImportProgressState>({
    total: 0,
    processed: 0,
    imported: 0,
    updated: 0,
    failed: 0,
    skipped: 0, // Inicializar skipped
    status: "running",
    startTime: null,
    lastUpdate: null,
    speed: 0,
    errors: [],
    csvInfo: null,
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

  const isExecutingRef = useRef(false) // Renamed from executingRef

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    loadSources()
    const interval = setInterval(checkRunningImports, 5000)
    const backgroundProgressInterval = setInterval(updateBackgroundImportsProgress, 2000)
    return () => {
      clearInterval(interval)
      clearInterval(backgroundProgressInterval)
    }
  }, [])

  // Sincronizar backgroundImports con importProgress en tiempo real
  useEffect(() => {
    if (sourceToImport?.id && (importProgress.status === "running" || importProgress.processed > 0 || importProgress.imported > 0 || importProgress.updated > 0)) {
      setBackgroundImports((prev) => {
        const updated = new Map(prev)
        updated.set(sourceToImport.id, { ...importProgress })
        return updated
      })
    }
  }, [importProgress, sourceToImport?.id])

  async function updateBackgroundImportsProgress() {
    if (backgroundImports.size === 0) return

    const updatedImports = new Map(backgroundImports)
    let hasUpdates = false

    for (const [sourceId, progress] of backgroundImports.entries()) {
      // Copiar el progreso actual de importProgress si es la misma fuente
      if (sourceToImport?.id === sourceId) {
        // Siempre sincronizar mientras haya una importación activa o recién finalizada
        if (importProgress.total > 0 || importProgress.processed > 0 || importProgress.imported > 0 || importProgress.updated > 0) {
          updatedImports.set(sourceId, { ...importProgress })
          hasUpdates = true
        }
      }
    }

    if (hasUpdates) {
      setBackgroundImports(updatedImports)
    }
  }

  const loadSources = useCallback(async () => {
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
      return sourcesWithSchedules
    } catch (error) {
      console.error("[v0] Error loading sources:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las fuentes de importación",
        variant: "destructive",
      })
      return []
    } finally {
      setLoading(false)
    }
  }, [supabase, toast])

  async function handleRunImport(source: SourceWithSchedule) {
    if (isExecutingRef.current) {
      return
    }

    // Determinar el modo por defecto según el tipo de feed
    let defaultMode = "create"
    if (source.feed_type === "catalog") {
      defaultMode = "create" // Solo crear nuevos productos
    } else if (source.feed_type === "stock_price" || source.name.toLowerCase().includes("stock")) {
      defaultMode = "update" // Actualizar stock/precio
    } else if (source.feed_type === "update") {
      defaultMode = "update" // Actualizar productos existentes
    }

    // Navegar directamente a batch-import sin autoStart para que el usuario configure opciones
    const encodedName = encodeURIComponent(source.name)
    window.location.href = `/inventory/sources/batch-import?sourceId=${source.id}&name=${encodedName}&mode=${defaultMode}`
  }

  const executeImport = useCallback(
    async (source: SourceWithSchedule) => {
      let historyId: string | undefined
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
          skipped: 0, // Inicializar skipped
          status: "running",
          startTime: now,
          lastUpdate: now,
          speed: 0,
          errors: [],
          csvInfo: null,
        })

        console.log("[v0] ===== INICIANDO IMPORTACIÓN DIRECTA DESDE NAVEGADOR =====")
        console.log("[v0] Fuente:", source.name, "| Tipo:", source.feed_type, "| Modo:", importMode)

        if (!source.url_template) {
          throw new Error("La fuente no tiene una URL configurada")
        }

        // Descargar y parsear el CSV
        console.log("[v0] Descargando CSV desde:", source.url_template)
        const csvResponse = await fetch(source.url_template)
        if (!csvResponse.ok) {
          throw new Error(`Error al descargar el CSV: ${csvResponse.statusText}`)
        }

        const csvText = await csvResponse.text()
        console.log("[v0] CSV descargado, tamaño:", csvText.length, "caracteres")

        // Detectar el separador
        const detectedSeparator = detectSeparator(csvText)
        console.log("[v0] Separador detectado:", detectedSeparator === "\t" ? "TAB" : detectedSeparator)

        const parsed = Papa.parse<Record<string, any>>(csvText, {
          header: true,
          skipEmptyLines: true,
          delimiter: detectedSeparator,
          transformHeader: (header) => {
            // Normalizar nombres de columnas: quitar espacios y convertir a minúsculas
            return header.trim().toLowerCase().replace(/\s+/g, "_")
          },
        })

        if (parsed.errors.length > 0) {
          console.error("[v0] Errores al parsear CSV:", parsed.errors)
          // Mostrar solo los primeros 5 errores
          const errorMessages = parsed.errors
            .slice(0, 5)
            .map((err) => `${err.message} (Code: ${err.code}, Row: ${err.row})`)
            .join("\n")
          toast({
            title: "Errores al parsear CSV",
            description: `Se encontraron ${parsed.errors.length} errores. Primeros 5:\n${errorMessages}`,
            variant: "destructive",
          })
        }

        const allProducts = parsed.data as Record<string, any>[] // Asumiendo que los datos son un array de objetos
        console.log("[v0] Total de productos en el CSV:", allProducts.length)
        console.log("[v0] Primera fila de datos:", allProducts[0])

        setImportProgress((prev) => ({
          ...prev,
          total: allProducts.length,
          csvInfo: {
            separator: detectedSeparator,
            headers: Object.keys(allProducts[0] || {}),
            firstRow: allProducts[0] || {},
          },
        }))

        const supabase = await createClient()

        const insertData: any = {
          source_id: source.id,
          status: "running",
          products_imported: 0,
          products_updated: 0,
          products_failed: 0,
          started_at: new Date().toISOString(),
        }

        // Intentar agregar products_skipped solo si la columna existe
        try {
          // Verificar si la columna 'products_skipped' existe en la tabla 'import_history'
          const { data: tableInfo, error: tableInfoError } = await supabase.rpc("get_column_info", {
            table_name: "import_history",
            column_name: "products_skipped",
          })

          if (tableInfoError) {
            console.warn("[v0] No se pudo verificar la columna 'products_skipped':", tableInfoError.message)
            // Continuar asumiendo que no existe si hay un error
          } else if (tableInfo && tableInfo.length > 0) {
            // La columna existe, agregarla
            insertData.products_skipped = 0
            console.log("[v0] Columna 'products_skipped' encontrada y añadida.")
          } else {
            console.log("[v0] Columna 'products_skipped' no encontrada en la tabla 'import_history'.")
          }
        } catch (e) {
          // Error al llamar a la función RPC o si la función no existe
          console.warn("[v0] Error al intentar verificar 'products_skipped' (posiblemente función RPC no definida):", e)
          // Continuar sin products_skipped
        }

        const { data: historyRecord, error: historyError } = await supabase
          .from("import_history")
          .insert(insertData)
          .select()
          .single()

        if (historyError || !historyRecord) {
          console.error("[v0] Error al crear registro de historial:", historyError)
          throw new Error("No se pudo crear el registro de historial")
        }

        historyId = historyRecord.id // Asignar a la variable declarada
        setCurrentImportHistoryId(historyId) // Guardar el ID del historial para poder cancelarlo
        console.log("[v0] Registro de historial creado con ID:", historyId)

        let backupSources: SourceWithSchedule[] = []
        const backupProducts: Map<string, any> = new Map()
        const missingSkus: string[] = []

        // Solo cargar fuentes de respaldo si es feed_type "stock_price"
        if (source.feed_type === "stock_price") {
          console.log("[v0] Fuente tipo stock_price detectada. Cargando fuentes de respaldo...")

          const allCurrentSources = await loadSources()
          backupSources = allCurrentSources
            .filter(
              (s) =>
                s.id !== source.id &&
                s.url_template &&
                s.feed_type === "catalog" &&
                s.name.toLowerCase().includes("arnoia"),
            )
            .sort((a, b) => {
              const aIsMain = a.name.toLowerCase() === "arnoia"
              const bIsMain = b.name.toLowerCase() === "arnoia"
              if (aIsMain && !bIsMain) return -1
              if (!aIsMain && bIsMain) return 1
              return a.name.localeCompare(b.name)
            })

          console.log(
            "[v0] Fuentes de respaldo encontradas:",
            backupSources.map((s) => s.name),
          )

          // Descargar CSVs de respaldo
          for (const backupSource of backupSources) {
            try {
              console.log("[v0] Descargando fuente de respaldo:", backupSource.name)
              const backupCsvResponse = await fetch(backupSource.url_template!)
              if (!backupCsvResponse.ok) continue

              const backupCsvText = await backupCsvResponse.text()
              const backupDetectedSeparator = detectSeparator(backupCsvText)
              const backupParsed = Papa.parse(backupCsvText, {
                header: true,
                delimiter: backupDetectedSeparator,
                skipEmptyLines: true,
                transformHeader: (header: string) => header.toLowerCase().trim().replace(/\s+/g, "_"),
              })

              for (const row of backupParsed.data as any[]) {
                const backupSku = (row.sku || row.codigo_interno || row.codigo || row.barcode || row.ean || row.upc)
                  ?.toString()
                  .trim()
                  .toUpperCase()
                if (backupSku) {
                  backupProducts.set(backupSku, row)
                }
              }

              console.log("[v0] Productos de respaldo cargados de", backupSource.name, ":", backupParsed.data.length)
            } catch (error) {
              console.error("[v0] Error al cargar fuente de respaldo:", backupSource.name, error)
            }
          }

          console.log("[v0] Total de productos de respaldo disponibles:", backupProducts.size)
        }

        // Procesar productos en batches
        const BATCH_SIZE = 200
        //const batches: Record<string, any>[][] = [] // Explicit type - No longer needed with direct loop
        //for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
        //  batches.push(allProducts.slice(i, i + BATCH_SIZE))
        //}

        console.log("[v0] Total de productos a procesar:", allProducts.length)
        console.log("[v0] Tamaño de cada batch:", BATCH_SIZE)

        let totalImported = 0
        let totalUpdated = 0
        let totalFailed = 0
        let totalSkipped = 0 // Inicializar contador de saltados
        let totalFromBackup = 0 // Contador para productos importados desde respaldo
        const allErrors: Array<{ sku: string; error: string; details?: string }> = [] // details ahora es opcional

        for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
          // Verificar si la importación fue cancelada
          if (importProgress.status === "cancelled") {
            console.log("[v0] Importación cancelada por el usuario")
            break
          }

          const batch = allProducts.slice(i, i + BATCH_SIZE) // Obtener el batch actual
          console.log(
            `[v0] Procesando batch ${Math.ceil((i + batch.length) / BATCH_SIZE)}/${Math.ceil(allProducts.length / BATCH_SIZE)}`,
          )

          // Obtener todos los SKUs del batch para consulta masiva
          const skusInBatch = batch
            .map((row: any) => {
              // Buscar SKU con nombres normalizados (espacios reemplazados por guiones bajos)
              const sku = (row.sku || row.codigo_interno || row.codigo || row.barcode || row.ean || row.upc)
                ?.toString()
                .trim()
                .toUpperCase()
              return sku
            })
            .filter(Boolean)

          // Si no hay SKUs válidos en el batch, continuar al siguiente
          if (skusInBatch.length === 0) {
            console.log("[v0] Batch sin SKUs válidos, saltando.")
            continue
          }

          // Consultar productos existentes para este batch
          const { data: existingProducts } = await supabase
            .from("products")
            .select("sku, id, source")
            .in("sku", skusInBatch)
          const existingProductsMap = new Map(existingProducts?.map((p) => [p.sku, p]) || [])

          // Procesar todos los productos del batch en paralelo
          const results = await Promise.allSettled(
            batch.map(async (row: any) => {
              let sku: string | undefined
              try {
                sku = extractFieldValue(row, "sku", source.column_mapping)?.toString().trim().toUpperCase()

                if (!sku) {
                  return { type: "error", error: "Sin SKU válido", row }
                }

                const title = extractFieldValue(row, "title", source.column_mapping)
                const description = extractFieldValue(row, "description", source.column_mapping)
                const category = extractFieldValue(row, "category", source.column_mapping)
                const brand = extractFieldValue(row, "brand", source.column_mapping)
                const priceValue = extractFieldValue(row, "price", source.column_mapping)
                const stockValue = extractFieldValue(row, "stock", source.column_mapping)
                
                // Extraer EAN y normalizarlo (quitar espacios y ceros a la izquierda)
                let ean = extractFieldValue(row, "ean", source.column_mapping)
                if (ean) {
                  ean = String(ean).trim().replace(/^0+/, "") || ean
                }

                // Validar si el precio o stock son números válidos
                const parsedPrice = Number.parseFloat(priceValue)
                const validPrice = !isNaN(parsedPrice) ? parsedPrice : 0
                const parsedStock = Number.parseInt(stockValue)
                const validStock = !isNaN(parsedStock) ? parsedStock : 0

                const existingProduct = existingProductsMap.get(sku)

                if (existingProduct) {
                  if (source.feed_type === "catalog") {
                    // Para catálogo completo: actualizar datos del producto incluyendo EAN
                    const updateData: any = {
                      price: validPrice,
                      stock: validStock,
                      updated_at: new Date().toISOString(),
                    }
                    
                    // Siempre actualizar EAN si viene en el CSV
                    if (ean) {
                      updateData.ean = ean
                    }
                    
                    // Actualizar otros campos si el title cambió
                    if (title && title !== existingProduct.title) {
                      updateData.title = title
                      updateData.description = description
                      updateData.category = category
                      updateData.brand = brand
                    }
                    
                    await supabase
                      .from("products")
                      .update(updateData)
                      .eq("id", existingProduct.id)
                    return { type: "updated" }
                  } else if (source.feed_type === "stock_price") {
                    // Para stock_price: solo actualizar precio/stock
                    await supabase
                      .from("products")
                      .update({
                        price: validPrice,
                        stock: validStock,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", existingProduct.id)
                    return { type: "updated" }
                  }
                } else {
                  // Producto nuevo
                  if (source.feed_type === "stock_price") {
                    // Si es stock_price y no existe, buscar en respaldo
                    const backupProduct = backupProducts.get(sku)
                    if (backupProduct) {
                      const backupTitle = extractFieldValue(backupProduct, "title", source.column_mapping)
                      const backupDescription = extractFieldValue(backupProduct, "description", source.column_mapping)
                      const backupCategory = extractFieldValue(backupProduct, "category", source.column_mapping)
                      const backupBrand = extractFieldValue(backupProduct, "brand", source.column_mapping)
                      
                      await supabase.from("products").insert({
                        sku,
                        ean: ean || null,
                        title: backupTitle || `Producto ${sku}`,
                        description: backupDescription,
                        category: backupCategory,
                        brand: backupBrand,
                        price: validPrice,
                        stock: validStock,
                        source: [source.name],
                      })
                      return { type: "imported_from_backup" }
                    } else {
                      missingSkus.push(sku)
                      return { type: "skipped" }
                    }
} else {
                  // Catálogo completo: insertar directamente
                  await supabase.from("products").insert({
                    sku,
                    ean: ean || null,
                    title: title || `Producto ${sku}`,
                    description,
                    category,
                    brand,
                    price: validPrice,
                    stock: validStock,
                    source: [source.name],
                  })
                  return { type: "imported" }
                  }
                }
              } catch (error: any) {
                return { type: "error", error: error.message, sku: sku || "desconocido" }
              }
            }),
          )

          // Contar resultados del batch
          for (const result of results) {
            if (result.status === "fulfilled") {
              const value = result.value
              if (value.type === "imported" || value.type === "imported_from_backup") {
                totalImported++
                if (value.type === "imported_from_backup") totalFromBackup++
              } else if (value.type === "updated") {
                totalUpdated++
              } else if (value.type === "skipped") {
                totalSkipped++
              } else if (value.type === "error") {
                totalFailed++
                allErrors.push({ sku: value.sku || "desconocido", error: value.error || "Error desconocido" })
              }
            } else {
              totalFailed++
              allErrors.push({ sku: "desconocido", error: result.reason?.message || "Error desconocido" })
            }
          }

          // Actualizar progreso
          const now = new Date()
          const elapsedSeconds = (now.getTime() - (importProgress.startTime?.getTime() || now.getTime())) / 1000
          const speed = elapsedSeconds > 0 ? (i + batch.length) / elapsedSeconds : 0

          setImportProgress((prev) => ({
            ...prev,
            processed: i + batch.length,
            imported: totalImported,
            updated: totalUpdated,
            failed: totalFailed,
            skipped: totalSkipped,
            lastUpdate: now,
            speed,
            errors: allErrors.slice(-10),
          }))
        }

        // Finalizar importación
        const finalStatus = importProgress.status === "cancelled" ? "cancelled" : totalFailed > 0 ? "completed_with_errors" : "completed"

        const updateData: any = {
          status: finalStatus,
          completed_at: new Date().toISOString(),
          products_imported: totalImported,
          products_updated: totalUpdated,
          products_failed: totalFailed,
        }

        // Intentar agregar products_skipped solo si la columna existe
        try {
          const { data: tableInfo, error: tableInfoError } = await supabase.rpc("get_column_info", {
            table_name: "import_history",
            column_name: "products_skipped",
          })

          if (!tableInfoError && tableInfo && tableInfo.length > 0) {
            updateData.products_skipped = totalSkipped
          }
        } catch (e) {
          console.warn("[v0] No se pudo actualizar 'products_skipped':", e)
        }

        await supabase.from("import_history").update(updateData).eq("id", historyId)

        setImportProgress((prev) => ({
          ...prev,
          status: finalStatus === "cancelled" ? "cancelled" : "completed",
        }))

        if (missingSkus.length > 0 && source.feed_type === "stock_price") {
          console.log("[v0] SKUs sin información de respaldo:", missingSkus.length)
        }

        if (totalFromBackup > 0) {
          console.log("[v0] Productos importados desde fuentes de respaldo:", totalFromBackup)
        }

        toast({
          title: "Importación completada",
          description: `Importados: ${totalImported} | Actualizados: ${totalUpdated} | Fallidos: ${totalFailed} | Saltados: ${totalSkipped}${totalFromBackup > 0 ? ` | Desde respaldo: ${totalFromBackup}` : ""}`,
        })

        await loadSources()
      } catch (error: any) {
        console.error("[v0] Error en importación:", error)
        setImportProgress((prev) => ({
          ...prev,
          status: "error",
        }))

        if (historyId) {
          await supabase
            .from("import_history")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error_message: error.message,
            })
            .eq("id", historyId)
        }

        toast({
          title: "Error en importación",
          description: error.message,
          variant: "destructive",
        })
      } finally {
        setImporting(null)
        isExecutingRef.current = false
      }
    },
    [extractFieldValue, importMode, importProgress.startTime, importProgress.status, loadSources, supabase, toast],
  )

  async function handleDeleteSource(source: SourceWithSchedule) {
    setSelectedSource(source)
    setShowDeleteDialog(true)
  }

  async function confirmDelete() {
    if (!selectedSource) return

    try {
      const { error } = await supabase.from("import_sources").delete().eq("id", selectedSource.id)

      if (error) throw error

      toast({
        title: "Fuente eliminada",
        description: `La fuente "${selectedSource.name}" ha sido eliminada correctamente`,
      })

      await loadSources()
      setShowDeleteDialog(false)
    } catch (error: any) {
      console.error("[v0] Error deleting source:", error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  async function checkRunningImports() {
    try {
      const { data, error } = await supabase
        .from("import_history")
        .select("id, source_id")
        .eq("status", "running")
        .order("started_at", { ascending: false })

      if (error) throw error

      const newRunningImports = new Map<string, string>()
      data?.forEach((record) => {
        newRunningImports.set(record.source_id, record.id)
      })

      setRunningImports(newRunningImports)
    } catch (error) {
      console.error("[v0] Error checking running imports:", error)
    }
  }

  function toggleSourceExpand(sourceId: string) {
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



  function cancelImport() {
    console.log("[v0] Cancelando importación...")
    setImportProgress((prev) => ({
      ...prev,
      status: "cancelled",
    }))

    if (currentImportHistoryId) {
      supabase
        .from("import_history")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
        })
        .eq("id", currentImportHistoryId)
        .then(() => {
          console.log("[v0] Historial de importación actualizado a 'cancelado'")
        })
    }

    toast({
      title: "Importación cancelada",
      description: "La importación ha sido cancelada por el usuario",
    })
  }

  function closeProgressDialog() {
    setShowProgressDialog(false)
    setCurrentImportHistoryId(null)
  }

  const handleDiagnostic = async () => {
    setLoadingDiagnostic(true)
    try {
      const response = await fetch("/api/diagnose-products")
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setDiagnosticData(data)
      setShowDiagnosticDialog(true)
    } catch (error: any) {
      console.error("[v0] Error en diagnóstico:", error)
      toast({
        title: "Error al diagnosticar",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoadingDiagnostic(false)
    }
  }

  const handleCleanDuplicates = async () => {
    if (!diagnosticData || diagnosticData.duplicateSKUs === 0) {
      toast({
        title: "Sin duplicados",
        description: "No hay SKUs duplicados para limpiar",
      })
      return
    }

    const confirmClean = window.confirm(
      `¿Estás seguro de que deseas eliminar ${diagnosticData.duplicateSKUs} productos duplicados?\n\nEsta acción no se puede deshacer.`,
    )

    if (!confirmClean) return

    setCleaningDuplicates(true)
    try {
      const response = await fetch("/api/clean-duplicates", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      toast({
        title: "Limpieza completada",
        description: `Se eliminaron ${result.deleted} productos duplicados`,
      })

      setShowDiagnosticDialog(false)
      await handleDiagnostic()
    } catch (error: any) {
      console.error("[v0] Error al limpiar duplicados:", error)
      toast({
        title: "Error al limpiar",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setCleaningDuplicates(false)
    }
  }

  const handleRunCron = async () => {
    setRunningCron(true)
    try {
      const response = await fetch("/api/cron/import-schedules")
      const data = await response.json()
      
      if (data.processed && data.processed.length > 0) {
        toast({
          title: "Cron ejecutado",
          description: `Se procesaron ${data.processed.length} importaciones programadas`,
        })
        // Recargar datos
        loadSources()
      } else {
        toast({
          title: "Sin tareas pendientes",
          description: data.message || "No hay importaciones programadas para ejecutar ahora",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error al ejecutar cron",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setRunningCron(false)
    }
  }

  const handleResetDatabase = async () => {
    if (resetConfirmText !== "ELIMINAR TODO") {
      toast({
        title: "Confirmación incorrecta",
        description: 'Debes escribir exactamente "ELIMINAR TODO" para confirmar',
        variant: "destructive",
      })
      return
    }

    setResetLoading(true)
    try {
      const response = await fetch("/api/reset-database", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      toast({
        title: "Base de datos reiniciada",
        description: `Se eliminaron ${result.deletedProducts} productos`,
      })

      setShowResetDialog(false)
      setResetConfirmText("")
      await loadSources()
    } catch (error: any) {
      console.error("[v0] Error al reiniciar base de datos:", error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setResetLoading(false)
    }
  }

  const handleAnalyzeDuplicates = async () => {
    console.log("[v0] 🔍 Iniciando análisis de duplicados...")
    setIsAnalyzing(true)
    setAnalysisResult(null)

    try {
      console.log("[v0] 📡 Llamando a /api/duplicates/find...")
      const response = await fetch("/api/duplicates/find")
      console.log("[v0] 📊 Respuesta recibida, status:", response.status)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log("[v0] ✅ Datos de análisis recibidos:", data)
      
      if (data.error && data.instructions) {
        // Mostrar instrucciones al usuario
        toast({
          title: "⚠️ Configuración requerida",
          description: data.instructions,
          variant: "destructive",
          duration: 10000,
        })
        setAnalysisResult({
          ...data,
          needsSQLSetup: true
        })
      } else if (data.method === 'sample_analysis') {
        toast({
          title: "Análisis completado (muestra)",
          description: `Análisis basado en muestra. ${data.note}`,
          variant: "default",
        })
        setAnalysisResult(data)
      } else {
        toast({
          title: "Análisis completado",
          description: `Se encontraron ${data.totalDuplicateSKUs} SKUs duplicados en ${data.totalProducts} productos`,
        })
        setAnalysisResult(data)
      }
      
      console.log("[v0] 💾 Estado analysisResult actualizado")
    } catch (error: any) {
      console.error("[v0] ❌ Error en análisis:", error)
      toast({
        title: "Error al analizar",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      console.log("[v0] 🏁 Finalizando análisis...")
      setIsAnalyzing(false)
    }
  }

  const handleCleanDuplicatesAuto = async () => {
    if (!analysisResult || analysisResult.totalDuplicateSKUs === 0) {
      toast({
        title: "Sin duplicados",
        description: "No hay productos duplicados para eliminar",
      })
      return
    }

    const confirmClean = window.confirm(
      `¿Estás seguro de que deseas eliminar productos duplicados?\n\n` +
      `• SKUs duplicados: ${analysisResult.totalDuplicateSKUs}\n` +
      `• Se mantendrá el producto más antiguo de cada SKU\n` +
      `• Esta acción puede tomar algunos minutos\n` +
      `• Esta acción NO se puede deshacer\n\n` +
      `¿Deseas continuar?`,
    )

    if (!confirmClean) return

    setIsCleaning(true)
    
    toast({
      title: "Iniciando limpieza",
      description: "Eliminando productos duplicados...",
    })
    
    try {
      console.log("[v0] 🗑️ Iniciando limpieza de duplicados...")
      const response = await fetch("/api/duplicates/delete", {
        method: "POST",
      })

      console.log("[v0] 📊 Respuesta de limpieza recibida, status:", response.status)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      console.log("[v0] ✅ Limpieza completada:", result)

      if (result.error && result.instructions) {
        toast({
          title: "⚠️ Configuración requerida",
          description: result.instructions,
          variant: "destructive",
          duration: 10000,
        })
      } else if (result.success) {
        toast({
          title: "✅ Limpieza completada exitosamente",
          description: `Se eliminaron ${result.deletedCount} productos duplicados.`,
        })
        
        // Re-analizar automáticamente después de limpiar
        console.log("[v0] 🔄 Iniciando re-análisis automático...")
        setTimeout(() => {
          handleAnalyzeDuplicates()
        }, 1000)
      } else {
        toast({
          title: "Limpieza completada con advertencias",
          description: `Se eliminaron ${result.deletedCount || 0} productos duplicados.`,
          variant: "default",
        })
      }
    } catch (error: any) {
      console.error("[v0] ❌ Error al limpiar duplicados:", error)
      toast({
        title: "Error al limpiar",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsCleaning(false)
    }
  }


  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Importaciones</h1>
          <p className="text-muted-foreground">Administra tus fuentes de datos y configuraciones de importación</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRunCron} disabled={runningCron}>
            {runningCron ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Ejecutar Cron
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDiagnosticDialog(true)} disabled={loadingDiagnostic}>
            {loadingDiagnostic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Diagnóstico
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowResetDialog(true)}>
            <Trash2 className="h-4 w-4" />
            Reiniciar Base
          </Button>
<Link href="/inventory/sources/batch-import">
  <Button variant="outline">
  <RefreshCw className="mr-2 h-4 w-4" />
  Importacion Masiva
  </Button>
  </Link>
  <Link href="/inventory/sources/new">
  <Button>
  <Upload className="mr-2 h-4 w-4" />
  Nueva Fuente
  </Button>
  </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay fuentes configuradas</h3>
            <p className="text-muted-foreground mb-4">Comienza creando tu primera fuente de importación</p>
            <Link href="/inventory/sources/new">
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Crear Fuente
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sources.map((source) => {
            const isExpanded = expandedSources.has(source.id)
            const isRunning = runningImports.has(source.id)
            const backgroundProgress = backgroundImports.get(source.id)

            return (
              <Card key={source.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl">{source.name}</CardTitle>
                        <Badge variant={source.feed_type === "catalog" ? "default" : "secondary"}>
                          {source.feed_type === "catalog" ? "Catálogo" : "Stock/Precio"}
                        </Badge>
                        {isRunning && (
                          <Badge variant="outline" className="text-blue-600">
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Importando...
                          </Badge>
                        )}
                      </div>
                      {source.description && (
                        <CardDescription className="mt-1">{source.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/inventory/sources/${source.id}`}>
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunImport(source)}
                        disabled={isRunning || importing === source.id}
                      >
                        {importing === source.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteSource(source)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSourceExpand(source.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Panel de progreso solo para importaciones del cliente (con total > 0) */}
                {backgroundProgress && backgroundProgress.status === "running" && backgroundProgress.total > 0 && (
                  <div className="px-6 pb-3">
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Importación en progreso
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-700 dark:text-blue-300">
                            {backgroundProgress.processed} / {backgroundProgress.total}
                          </span>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              if (sourceToImport?.id === source.id) {
                                cancelImport()
                              } else {
                                // Cancelar importación de esta fuente específica
                                setBackgroundImports((prev) => {
                                  const updated = new Map(prev)
                                  const current = updated.get(source.id)
                                  if (current) {
                                    updated.set(source.id, { ...current, status: "cancelled" })
                                  }
                                  return updated
                                })
                                setRunningImports((prev) => {
                                  const updated = new Map(prev)
                                  updated.delete(source.id)
                                  return updated
                                })
                                toast({
                                  title: "Importación cancelada",
                                  description: `La importación de ${source.name} ha sido cancelada`,
                                })
                              }
                            }}
                          >
                            <StopCircle className="h-3 w-3 mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                      <div className="w-full bg-blue-100 dark:bg-blue-900/50 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${(backgroundProgress.processed / backgroundProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-blue-700 dark:text-blue-300">
                        <span>Nuevos: {backgroundProgress.imported}</span>
                        <span>Actualizados: {backgroundProgress.updated}</span>
                        <span>Fallidos: {backgroundProgress.failed}</span>
                      </div>
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {source.last_import && (
                        <div className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-center gap-2 mb-2">
                            <History className="h-4 w-4" />
                            <span className="font-medium">Última Importación</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <div className="text-muted-foreground">Fecha</div>
                              <div className="font-medium">
                                {new Date(source.last_import.started_at).toLocaleDateString("es-AR")}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Estado</div>
                              <Badge
                                variant={
                                  source.last_import.status === "completed"
                                    ? "default"
                                    : source.last_import.status === "failed"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {source.last_import.status}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Importados</div>
                              <div className="font-medium">{source.last_import.products_imported}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Actualizados</div>
                              <div className="font-medium">{source.last_import.products_updated}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {source.url_template && (
                        <div className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4" />
                            <span className="font-medium">Configuración</span>
                          </div>
                          <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>URL:</span>
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {source.url_template.length > 60
                                  ? source.url_template.substring(0, 60) + "..."
                                  : source.url_template}
                              </code>
                            </div>
                          </div>
                        </div>
                      )}

                      {source.schedules && source.schedules.length > 0 && (
                        <div className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="h-4 w-4" />
                            <span className="font-medium">Programaciones</span>
                          </div>
                          <div className="space-y-2">
                            {source.schedules.map((schedule) => (
                              <div key={schedule.id} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <Switch checked={schedule.enabled} disabled />
                                  <span>
                                    {schedule.frequency === "daily"
                                      ? "Diaria"
                                      : schedule.frequency === "weekly"
                                        ? "Semanal"
                                        : "Mensual"}
                                  </span>
                                  <Badge variant="outline">
                                    {String(schedule.hour).padStart(2, "0")}:{String(schedule.minute).padStart(2, "0")}
                                  </Badge>
                                </div>
                                {schedule.next_run_at && (
                                  <span className="text-muted-foreground text-xs">
                                    Próxima: {new Date(schedule.next_run_at).toLocaleDateString("es-AR")}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar la fuente &quot;{selectedSource?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <Dialog open={showProgressDialog} onOpenChange={(open) => !open && closeProgressDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Progreso de Importación</DialogTitle>
            <DialogDescription>
              {importProgress.status === "running"
                ? "Procesando productos..."
                : importProgress.status === "completed"
                  ? "Importación completada"
                  : importProgress.status === "cancelled"
                    ? "Importación cancelada"
                    : "Error en la importación"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso</span>
                <span>
                  {importProgress.processed} / {importProgress.total}
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    importProgress.status === "completed"
                      ? "bg-green-600"
                      : importProgress.status === "error"
                        ? "bg-red-600"
                        : importProgress.status === "cancelled"
                          ? "bg-yellow-600"
                          : "bg-primary"
                  }`}
                  style={{
                    width: `${importProgress.total > 0 ? (importProgress.processed / importProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {importProgress.csvInfo && (
              <div className="border rounded-lg p-3 bg-muted/30 text-sm">
                <div className="font-medium mb-2">Información del CSV</div>
                <div className="space-y-1 text-muted-foreground">
                  <div>Separador: {importProgress.csvInfo.separator === "\t" ? "TAB" : importProgress.csvInfo.separator}</div>
                  <div>Columnas: {importProgress.csvInfo.headers.length}</div>
                  <div className="text-xs">
                    Headers: {importProgress.csvInfo.headers.slice(0, 5).join(", ")}
                    {importProgress.csvInfo.headers.length > 5 && "..."}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Importados</div>
                <div className="text-2xl font-bold text-green-600">{importProgress.imported}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Actualizados</div>
                <div className="text-2xl font-bold text-blue-600">{importProgress.updated}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Fallidos</div>
                <div className="text-2xl font-bold text-red-600">{importProgress.failed}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Saltados</div>
                <div className="text-2xl font-bold text-yellow-600">{importProgress.skipped}</div>
              </div>
            </div>

            {importProgress.speed > 0 && (
              <div className="text-sm text-muted-foreground">
                Velocidad: {importProgress.speed.toFixed(1)} productos/segundo
              </div>
            )}

            {importProgress.errors.length > 0 && (
              <div className="border rounded-lg p-3 bg-red-50 dark:bg-red-950/20 max-h-32 overflow-y-auto">
                <div className="font-medium text-sm text-red-900 dark:text-red-100 mb-2">Últimos errores</div>
                <div className="space-y-1">
                  {importProgress.errors.map((error, idx) => (
                    <div key={idx} className="text-xs text-red-800 dark:text-red-200">
                      <span className="font-mono">{error.sku}</span>: {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {importProgress.status === "running" ? (
              <Button variant="destructive" onClick={cancelImport}>
                <StopCircle className="mr-2 h-4 w-4" />
                Cancelar Importación
              </Button>
            ) : (
              <Button onClick={closeProgressDialog}>Cerrar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDiagnosticDialog} onOpenChange={setShowDiagnosticDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Análisis Automático</DialogTitle>
            <DialogDescription>
              Analiza tu base de datos para detectar productos con SKUs duplicados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button 
              onClick={handleAnalyzeDuplicates} 
              disabled={isAnalyzing}
              className="w-full"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analizando... Esto puede tomar 2-3 minutos
                </>
              ) : (
                <>
                  <Search className="mr-2 h-5 w-5" />
                  Analizar Duplicados
                </>
              )}
            </Button>

            {analysisResult?.needsSQLSetup && (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="font-semibold text-yellow-900 dark:text-yellow-100">
                      Configuración SQL requerida
                    </div>
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">
                      {analysisResult.instructions}
                    </div>
                    <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                      <div className="font-medium">Pasos para configurar:</div>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Abre el script SQL en la carpeta <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">scripts/</code></li>
                        <li>Copia el contenido del archivo <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">EJECUTAR_PRIMERO_crear_funciones.sql</code></li>
                        <li>Abre el SQL Editor de Supabase</li>
                        <li>Pega y ejecuta el script</li>
                        <li>Vuelve aquí y analiza nuevamente</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {analysisResult && !analysisResult.needsSQLSetup && (
              <>
                {analysisResult.method && (
                  <div className="text-xs text-muted-foreground text-center mb-4">
                    Método: {analysisResult.method === 'sql_direct' ? 'SQL Directo (completo)' : 'Análisis de muestra'}
                    {analysisResult.note && ` • ${analysisResult.note}`}
                  </div>
                )}

                {analysisResult.totalDuplicateSKUs > 0 ? (
                  <div className="space-y-4">
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <div className="font-semibold text-red-900 dark:text-red-100">
                          Se detectaron duplicados
                        </div>
                      </div>
                      <div className="text-sm text-red-800 dark:text-red-200">
                        {analysisResult.totalDuplicateProducts !== undefined ? (
                          <>
                            Se encontraron <span className="font-bold">{analysisResult.totalDuplicateSKUs} SKUs duplicados</span> con un total de{' '}
                            <span className="font-bold">{analysisResult.totalDuplicateProducts.toLocaleString()} productos duplicados</span> en tu base de datos.
                            <div className="mt-2 text-xs">
                              Promedio: ~{Math.round(analysisResult.totalDuplicateProducts / analysisResult.totalDuplicateSKUs)} productos por cada SKU duplicado
                            </div>
                          </>
                        ) : (
                          <>Se encontraron {analysisResult.totalDuplicateSKUs} SKUs con productos duplicados en tu base de datos.</>
                        )}
                      </div>
                    </div>

                    <Button 
                      onClick={handleCleanDuplicatesAuto} 
                      disabled={isCleaning}
                      variant="destructive"
                      className="w-full"
                      size="lg"
                    >
                      {isCleaning ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Eliminando duplicados...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-5 w-5" />
                          Eliminar {analysisResult.totalDuplicateProducts !== undefined ? `${analysisResult.totalDuplicateProducts.toLocaleString()} ` : ''}Duplicados
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div className="font-semibold text-green-900 dark:text-green-100">
                        ¡Base de datos saludable!
                      </div>
                    </div>
                    <div className="text-sm text-green-800 dark:text-green-200">
                      No se detectaron problemas
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiagnosticDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reiniciar Base de Datos</DialogTitle>
            <DialogDescription>
              Esta acción eliminará TODOS los productos de la base de datos. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-text">
                Escribe <span className="font-mono font-bold">ELIMINAR TODO</span> para confirmar
              </Label>
              <Input
                id="confirm-text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="ELIMINAR TODO"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetDatabase}
              disabled={resetLoading || resetConfirmText !== "ELIMINAR TODO"}
            >
              {resetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Eliminar Todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
