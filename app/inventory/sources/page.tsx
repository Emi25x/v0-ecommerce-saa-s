"use client"

import { useCallback, useEffect, useState, useRef } from "react" // Importar useRef
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
  Hourglass,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react" // Importar AlertTriangle y DollarSign
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
import { useRouter } from "next/navigation" // Importar useRouter

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
        sku: ["sku", "codigo_interno", "codigo", "barcode", "ean", "upc"],
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
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false)
  const [sourceToImport, setSourceToImport] = useState<SourceWithSchedule | null>(null)
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

  async function updateBackgroundImportsProgress() {
    if (backgroundImports.size === 0) return

    const updatedImports = new Map(backgroundImports)
    let hasUpdates = false

    for (const [sourceId, progress] of backgroundImports.entries()) {
      if (progress.status !== "running") continue

      // Copiar el progreso actual de importProgress si es la misma fuente
      if (sourceToImport?.id === sourceId && importProgress.status === "running") {
        updatedImports.set(sourceId, { ...importProgress })
        hasUpdates = true
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

    setSourceToImport(source)
    setImportMode("update")
    setShowImportConfirmDialog(true)
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
              try {
                const sku = extractFieldValue(row, "sku", source.column_mapping)?.toString().trim().toUpperCase()

                if (!sku) {
                  return { type: "error", error: "Sin SKU válido", row }
                }

                const title = extractFieldValue(row, "title", source.column_mapping)
                const description = extractFieldValue(row, "description", source.column_mapping)
                const category = extractFieldValue(row, "category", source.column_mapping)
                const brand = extractFieldValue(row, "brand", source.column_mapping)
                const priceValue = extractFieldValue(row, "price", source.column_mapping)
                const stockValue = extractFieldValue(row, "stock", source.column_mapping)

                // Validar si el precio o stock son números válidos
                const parsedPrice = Number.parseFloat(priceValue)
                const validPrice = !isNaN(parsedPrice) ? parsedPrice : 0
                const parsedStock = Number.parseInt(stockValue)
                const validStock = !isNaN(parsedStock) ? parsedStock : 0

                const existingProduct = existingProductsMap.get(sku)

                if (existingProduct) {
                  // Si es catalog, diferenciar entre Arnoia (respeta importMode) y Arnoia Act (siempre actualiza)
                  if (source.feed_type === "catalog") {
                    const isMainCatalog =
                      source.name.toLowerCase() === "arnoia" && !source.name.toLowerCase().includes("act")

                    if (isMainCatalog) {
                      // Para "Arnoia" (catálogo base completo), respetar el modo de importación seleccionado
                      if (importMode === "skip") {
                        console.log(`[v0] Producto ${sku} ya existe y modo es "skip", saltando.`)
                        return { type: "skipped", sku }
                      }

                      // Si el modo es "update" o "overwrite", actualizar el producto
                      console.log(
                        `[v0] Producto ${sku} existe, actualizando desde catálogo base "Arnoia" (modo: ${importMode})...`,
                      )

                      const { error: updateError } = await supabase
                        .from("products")
                        .update({
                          title: title || existingProduct.title,
                          description: description || existingProduct.description,
                          category: category || existingProduct.category,
                          brand: brand || existingProduct.brand,
                          price: validPrice,
                          stock: validStock,
                          updated_at: new Date().toISOString(),
                        })
                        .eq("sku", sku)

                      if (updateError) {
                        console.error("[v0] Error actualizando producto:", updateError)
                        return { type: "error", error: updateError.message, sku }
                      }

                      return { type: "updated", sku }
                    }

                    // Para "Arnoia Act" (actualización semanal), siempre actualizar productos existentes
                    console.log(`[v0] Producto ${sku} existe, actualizando desde "${source.name}"...`)
                    const currentSources = Array.isArray(existingProduct.source) ? existingProduct.source : []
                    if (!currentSources.includes(source.id)) {
                      currentSources.push(source.id)
                    }

                    const { error: updateError } = await supabase
                      .from("products")
                      .update({
                        title: title || existingProduct.title,
                        description: description || existingProduct.description,
                        category: category || existingProduct.category,
                        brand: brand || existingProduct.brand,
                        price: validPrice,
                        stock: validStock,
                        source: currentSources,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", existingProduct.id)

                    if (updateError) throw updateError
                    return { type: "updated", sku }
                  }

                  // Si es stock_price, actualizar solo precio y stock
                  if (source.feed_type === "stock_price") {
                    const currentSources = Array.isArray(existingProduct.source) ? existingProduct.source : []
                    if (!currentSources.includes(source.id)) {
                      currentSources.push(source.id)
                    }

                    const { error: updateError } = await supabase
                      .from("products")
                      .update({
                        price: validPrice,
                        stock: validStock,
                        source: currentSources,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", existingProduct.id)

                    if (updateError) throw updateError
                    return { type: "updated", sku }
                  }

                  // Para otros tipos de fuentes, aplicar el modo de importación seleccionado
                  if (importMode === "skip") {
                    console.log(`[v0] Producto ${sku} ya existe, saltando (modo skip).`)
                    return { type: "skipped", sku }
                  }

                  const productData: any = {
                    title: title || sku,
                    description,
                    category,
                    brand,
                    price: validPrice,
                    stock: validStock,
                  }
                  const currentSources = Array.isArray(existingProduct.source) ? existingProduct.source : []
                  if (!currentSources.includes(source.id)) {
                    productData.source = [...currentSources, source.id]
                  }
                  productData.updated_at = new Date().toISOString()

                  const { error: updateError } = await supabase
                    .from("products")
                    .update(productData)
                    .eq("id", existingProduct.id)

                  if (updateError) throw updateError
                  return { type: "updated", sku }
                } else {
                  if (source.feed_type === "stock_price") {
                    // Buscar en productos de respaldo
                    const backupProduct = backupProducts.get(sku)
                    if (backupProduct && backupSources.length > 0) {
                      console.log(`[v0] Producto ${sku} no existe, importando desde respaldo...`)

                      const fullProductData: any = {
                        sku,
                        title: backupProduct.nombre || backupProduct.title || backupProduct.name || sku,
                        description: backupProduct.descripcion || backupProduct.description || null,
                        price: validPrice,
                        stock: validStock,
                        category: backupProduct.categoria || backupProduct.category || null,
                        brand: backupProduct.marca || backupProduct.brand || null,
                        source: [source.id],
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      }

                      const { error: insertError } = await supabase.from("products").insert(fullProductData)
                      if (insertError) throw insertError

                      return { type: "inserted_from_backup", sku }
                    } else {
                      // No se encontró en respaldo, agregar a lista de faltantes
                      missingSkus.push(sku)
                      return { type: "error", error: "Producto no encontrado en base ni en respaldo", sku }
                    }
                  }

                  // Si es catalog, crear nuevo producto
                  if (source.feed_type === "catalog") {
                    const productData: any = {
                      sku,
                      title: title || sku,
                      description,
                      category,
                      brand,
                      price: validPrice,
                      stock: validStock,
                      source: [source.id],
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }

                    const { error: insertError } = await supabase.from("products").insert(productData)
                    if (insertError) throw insertError
                    return { type: "inserted", sku }
                  }
                }

                // Si llegamos aquí, es porque no se aplica ninguna acción (ej. modo skip y no existe)
                return { type: "skipped", sku }
              } catch (error: any) {
                return {
                  type: "error",
                  error: error.message || "Error desconocido",
                  sku:
                    (row.sku || row.codigo_interno || row.codigo || row.barcode || row.ean || row.upc)
                      ?.toString()
                      .trim()
                      .toUpperCase() || "Desconocido",
                  details: error.stack, // Capturar el stack trace si está disponible
                }
              }
            }),
          )

          // Contar resultados del batch incluyendo productos desde respaldo
          let batchImported = 0
          let batchUpdated = 0
          let batchSkipped = 0
          let batchFailed = 0
          let batchFromBackup = 0

          for (const result of results) {
            if (result.status === "fulfilled") {
              const { value } = result as {
                status: "fulfilled"
                value: { type: string; sku: string; error?: string; row?: any; details?: string }
              }
              if (value.type === "inserted") {
                batchImported++
              } else if (value.type === "inserted_from_backup") {
                batchImported++
                batchFromBackup++
              } else if (value.type === "updated") {
                batchUpdated++
              } else if (value.type === "skipped") {
                batchSkipped++ // Contar saltados
              } else if (value.type === "error") {
                batchFailed++
                if (value.sku && value.error) {
                  allErrors.push({ sku: value.sku, error: value.error, details: value.details })
                }
              }
            } else {
              // Handle rejected promises
              batchFailed++
              const errorReason = (result as any).reason
              const errorMessage = errorReason?.message || "Error desconocido"
              const skuFromError = errorReason?.sku || "Desconocido" // Intentar obtener SKU del resultado
              const details = errorReason?.details || errorReason?.stack || ""

              allErrors.push({
                sku: skuFromError,
                error: errorMessage,
                details: details,
              })
            }
          }

          totalImported += batchImported
          totalUpdated += batchUpdated
          totalSkipped += batchSkipped
          totalFailed += batchFailed
          totalFromBackup += batchFromBackup

          console.log(
            `[v0] Batch ${Math.ceil((i + batch.length) / BATCH_SIZE)}/${Math.ceil(allProducts.length / BATCH_SIZE)}: ${batchImported} importados (${batchFromBackup} desde respaldo), ${batchUpdated} actualizados, ${batchSkipped} saltados, ${batchFailed} fallidos`,
          )

          // Actualizar progreso general
          const processedCount = Math.min(i + batch.length, allProducts.length) // Asegurar que no supere el total
          const elapsed = (new Date().getTime() - now.getTime()) / 1000
          const speed = elapsed > 0 ? processedCount / elapsed : 0
          const currentProgress = {
            total: allProducts.length,
            processed: processedCount,
            imported: totalImported,
            updated: totalUpdated,
            failed: totalFailed,
            skipped: totalSkipped, // Agregar skipped al progreso
            status: "running" as const,
            startTime: now,
            lastUpdate: new Date(),
            speed: Number.isFinite(speed) ? speed : 0,
            errors: allErrors.slice(0, 5), // Solo mostrar los primeros 5 errores en el modal
            csvInfo: importProgress.csvInfo, // Mantener la info del CSV
          }

          setImportProgress((prev) => ({
            ...prev,
            ...currentProgress,
          }))

          // Actualizar backgroundImports SIEMPRE para que la ficha muestre progreso
          setBackgroundImports((prev) => {
            const updated = new Map(prev)
            updated.set(source.id, currentProgress)
            return updated
          })
        }

        // Finalizar importación
        const finalStatus = importProgress.status === "cancelled" ? "cancelled" : totalFailed > 0 ? "error" : "success"
        //const finalMessage =
        //  totalFailed > 0 && importProgress.status !== "cancelled" ? `Se encontraron ${totalFailed} errores.` : ""

        console.log("[v0] Finalizando importación...")
        console.log("[v0] Estado final:", finalStatus)
        console.log(
          "[v0] Importados:",
          totalImported,
          "Actualizados:",
          totalUpdated,
          "Fallidos:",
          totalFailed,
          "Saltados:",
          totalSkipped,
          `(${totalFromBackup} desde respaldo)`,
        )

        if (missingSkus.length > 0) {
          console.warn(
            `[v0] ⚠️ ${missingSkus.length} productos no encontrados en base ni en respaldo:`,
            missingSkus.slice(0, 10),
          )
          allErrors.push({
            sku: "Global",
            error: `${missingSkus.length} productos no encontrados en base ni en respaldo.`,
          })
        }

        if (historyId) {
          const updateData: any = {
            status: finalStatus,
            products_imported: totalImported,
            products_updated: totalUpdated,
            products_failed: totalFailed,
            products_skipped: totalSkipped, // Guardar el total de skipped
            completed_at: new Date().toISOString(),
            error_message:
              finalStatus === "error"
                ? allErrors
                    .slice(0, 3)
                    .map((e) => `${e.sku}: ${e.error}`)
                    .join("; ")
                : null,
          }

          const { error: updateError } = await supabase.from("import_history").update(updateData).eq("id", historyId)

          if (updateError) {
            console.error("[v0] Error al actualizar registro de historial:", updateError)
          } else {
            console.log("[v0] Registro de historial actualizado correctamente")
          }
        }

        setImportProgress((prev) => ({
          ...prev,
          status: finalStatus,
          processed: allProducts.length, // Asegurar que el progreso total se actualice
          failed: totalFailed,
          skipped: totalSkipped, // Asegurar que skipped se actualice
          errors: allErrors, // Guardar todos los errores
        }))

        setBackgroundImports((prev) => {
          const updated = new Map(prev)
          updated.delete(source.id)
          return updated
        })

        // Recargar fuentes para actualizar el estado en la UI
        await loadSources()

        if (importProgress.status !== "cancelled") {
          if (finalStatus === "success") {
            toast({
              title: "Importación completada",
              description: `${totalImported} productos importados (${totalFromBackup} desde respaldo), ${totalUpdated} actualizados. ${totalSkipped} productos saltados.`,
            })
          } else if (finalStatus === "error") {
            toast({
              title: "Importación con errores",
              description: `Se completó con ${totalFailed} productos fallidos, ${totalSkipped} saltados. Revisa los detalles en el log.`,
              variant: "destructive",
            })
          }
        } else {
          toast({
            title: "Importación cancelada",
            description: "La importación fue cancelada por el usuario.",
            variant: "destructive",
          })
        }
      } catch (error: any) {
        console.error("[v0] ===== ERROR EN IMPORTACIÓN =====")
        console.error("[v0] Error:", error)
        console.error("Error stack:", error.stack) // Log stack trace for debugging

        setImportProgress((prev) => ({
          ...prev,
          status: "error",
          errors: [{ sku: "Global", error: error.message, details: error.stack || "" }],
        }))

        setBackgroundImports((prev) => {
          const updated = new Map(prev)
          updated.delete(source.id)
          return updated
        })

        toast({
          title: "Error crítico",
          description: error.message || "Ocurrió un error inesperado durante la importación.",
          variant: "destructive",
        })

        if (historyId) {
          const supabase = await createClient() // Asegurarse de que supabase esté disponible
          await supabase
            .from("import_history")
            .update({
              status: "error",
              completed_at: new Date().toISOString(),
              error_message: error.message,
            })
            .eq("id", historyId)
        }
      } finally {
        setImporting(null)
        setShowImportConfirmDialog(false)
        //setSourceToImport(null) // No resetear aquí, el modal de progreso maneja esto
        //isExecutingRef.current = false // Mover a después del timeout

        setTimeout(() => {
          if (!showProgressDialog) {
            // Solo cerrar modal de progreso si no está abierto
            setShowProgressDialog(false)
          }
          setCurrentImportHistoryId(null) // Resetear el ID del historial al cerrar el modal de progreso
          isExecutingRef.current = false // Liberar el flag después de que el modal se cierre
          console.log("[v0] Liberando isExecutingRef después de cerrar modal de progreso (o timeout)")
        }, 1000) // Un pequeño delay para que el usuario vea el estado final antes de cerrar
      }
    },
    [
      importMode,
      showProgressDialog,
      backgroundImports,
      importProgress,
      sourceToImport,
      toast,
      loadSources,
      supabase,
      isExecutingRef,
      router, // Incluir router si es necesario
      extractFieldValue, // Asegurarse de incluir extractFieldValue en las dependencias
    ], // Added isExecutingRef here
  )

  async function handleCleanupStuckImports() {
    try {
      const response = await fetch("/api/fix-imports")
      const result = await response.json()

      if (result.success) {
        toast({
          title: "Limpieza completada",
          description: `Se cancelaron ${result.fixed} importaciones atascadas.`,
        })
        await loadSources() // Recargar fuentes para actualizar UI
      }
    } catch (error) {
      console.error("[v0] Error limpiando importaciones:", error)
      toast({
        title: "Error",
        description: "No se pudieron limpiar las importaciones atascadas.",
        variant: "destructive",
      })
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
      // Eliminar programaciones asociadas
      const { error: deleteSchedulesError } = await supabase
        .from("import_schedules")
        .delete()
        .eq("source_id", selectedSource.id)
      if (deleteSchedulesError) {
        console.error("Error deleting associated schedules:", deleteSchedulesError)
        // Continuar con la eliminación de la fuente incluso si falla la eliminación de schedules
      }

      // Eliminar fuente principal
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

    const schedule = source.schedules.length > 0 ? source.schedules[0] : null // Usar el primer schedule si existe

    if (schedule) {
      const hourStr = String(schedule.hour || 0).padStart(2, "0")
      const minuteStr = String(schedule.minute || 0).padStart(2, "0")

      setScheduleConfig({
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        timezone: schedule.timezone,
        hour: `${hourStr}:${minuteStr}`,
        dayOfWeek: schedule.day_of_week ?? 1, // Default to Monday
        dayOfMonth: schedule.day_of_month ?? 1, // Default to 1st day
      })
    } else {
      // Valores por defecto si no hay schedule
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

      // Pequeño delay para asegurar que la UI se actualice antes de recargar
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

  async function handleCancelImport(sourceId?: string) {
    try {
      // Si hay una importación activa en el diálogo
      if (importing && showProgressDialog && sourceToImport?.id === (sourceId || importing)) {
        console.log(`[v0] Cancelando importación activa en diálogo: ${importing}`)

        setImportProgress((prev) => ({ ...prev, status: "cancelled" }))

        if (currentImportHistoryId) {
          await supabase
            .from("import_history")
            .update({
              status: "cancelled",
              completed_at: new Date().toISOString(),
              error_message: "Importación cancelada por el usuario",
              products_imported: importProgress.imported,
              products_updated: importProgress.updated,
              products_failed: importProgress.failed,
            })
            .eq("id", currentImportHistoryId)
        }

        toast({
          title: "Importación cancelada",
          description: `Se procesaron ${importProgress.processed} de ${importProgress.total} productos. Importados: ${importProgress.imported}, Actualizados: ${importProgress.updated}, Fallidos: ${importProgress.failed}`,
        })

        loadSources()
        return
      }

      // Si se pasa un sourceId, cancelar importación en segundo plano
      if (sourceId) {
        const bgImport = backgroundImports.get(sourceId)
        if (bgImport) {
          console.log(`[v0] Cancelando importación en segundo plano: ${sourceId}`)

          const updatedImports = new Map(backgroundImports)
          updatedImports.delete(sourceId)
          setBackgroundImports(updatedImports)

          const { data: runningHistory } = await supabase
            .from("import_history")
            .select("id")
            .eq("source_id", sourceId)
            .eq("status", "running")
            .maybeSingle()

          if (runningHistory) {
            await supabase
              .from("import_history")
              .update({
                status: "cancelled",
                completed_at: new Date().toISOString(),
                error_message: "Importación cancelada por el usuario",
                products_imported: bgImport.imported,
                products_updated: bgImport.updated,
                products_failed: bgImport.failed,
              })
              .eq("id", runningHistory.id)
          }

          toast({
            title: "Importación cancelada",
            description: `Se procesaron ${bgImport.processed} de ${bgImport.total} productos. Importados: ${bgImport.imported}, Actualizados: ${bgImport.updated}, Fallidos: ${bgImport.failed}`,
          })

          loadSources()
          return
        }
      }

      toast({
        title: "Nada que cancelar",
        description: "No hay importaciones activas o el ID proporcionado no coincide.",
        variant: "secondary",
      })
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
      // Obtener todas las importaciones que están 'running' en la DB
      const { data: runningHistory } = await supabase
        .from("import_history")
        .select("id, source_id, status") // Incluir status para verificar
        .or("status.eq.running,status.eq.processing") // Considerar ambos estados como activos

      if (runningHistory && runningHistory.length > 0) {
        const newRunningImports = new Map<string, string>()
        runningHistory.forEach((h) => {
          // Solo agregar si el estado es 'running' o 'processing'
          if (h.status === "running" || h.status === "processing") {
            newRunningImports.set(h.source_id, h.id) // Guardar source_id y history_id
          }
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
        setImportProgress(backgroundImport) // Cargar el progreso guardado
        setShowProgressDialog(true)
        console.log("[v0] Modal de importación recuperado para:", source.name)
      }
    }
  }

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

  const handleDiagnostic = async () => {
    setLoadingDiagnostic(true)
    try {
      const response = await fetch("/api/diagnose-products")
      const data = await response.json()
      setDiagnosticData(data)
      setShowDiagnosticDialog(true)
    } catch (error) {
      console.error("Error al ejecutar diagnóstico:", error)
      toast({
        title: "Error",
        description: "No se pudo ejecutar el diagnóstico",
        variant: "destructive",
      })
    } finally {
      setLoadingDiagnostic(false)
    }
  }

  const handleCleanDuplicates = async () => {
    // El totalDuplicateProducts es el número de items que deben ser eliminados
    if (!diagnosticData?.totalDuplicateProducts || diagnosticData.totalDuplicateProducts <= 0) return

    const confirmed = window.confirm(
      `¿Estás seguro de que quieres eliminar ${diagnosticData.totalDuplicateProducts} productos duplicados?\n\n` +
        `Se mantendrán los productos más antiguos de cada SKU duplicado.\n\n` +
        `Esta acción NO se puede deshacer.`,
    )

    if (!confirmed) return

    setCleaningDuplicates(true)
    try {
      const response = await fetch("/api/clean-duplicates", {
        method: "POST",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al limpiar duplicados")
      }

      toast({
        title: "Limpieza completada",
        description: `Se eliminaron ${data.deletedCount} productos duplicados`,
      })

      // Cerrar el diálogo y recargar el diagnóstico
      setShowDiagnosticDialog(false)
      setDiagnosticData(null)

      // Recargar la lista de productos
      // loadSources() // Cargar fuentes no recarga productos, necesitamos una función específica
      // Assuming a function 'loadProducts' exists or needs to be implemented elsewhere
      // For now, we'll just log and let the user navigate or refresh manually if needed.
      console.log("Products should be reloaded, but 'loadProducts' function is not defined in this scope.")
    } catch (error: any) {
      console.error("Error al limpiar duplicados:", error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron limpiar los duplicados",
        variant: "destructive",
      })
    } finally {
      setCleaningDuplicates(false)
    }
  }

  const handleResetDatabase = async () => {
    if (resetConfirmText !== "ELIMINAR TODO") {
      toast({
        title: "Error",
        description: "Debes escribir 'ELIMINAR TODO' para confirmar",
        variant: "destructive",
      })
      return
    }

    setResetLoading(true)
    try {
      const response = await fetch("/api/reset-products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: resetConfirmText }),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: "Base de datos reiniciada",
          description: `Se eliminaron ${result.deleted} productos correctamente`,
        })
        setShowResetDialog(false)
        setResetConfirmText("")
        await loadSources()
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      console.error("[v0] Error reiniciando base de datos:", error)
      toast({
        title: "Error",
        description: error.message || "No se pudo reiniciar la base de datos",
        variant: "destructive",
      })
    } finally {
      setResetLoading(false)
    }
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
      {/* Cambios aquí */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Gestor de Importaciones</h1>
          <p className="text-muted-foreground mt-2">Administra tus fuentes de importación y sus configuraciones</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button onClick={handleCleanupStuckImports} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Limpiar importaciones
          </Button>
          <Button onClick={handleDiagnostic} variant="outline" size="sm" disabled={loadingDiagnostic}>
            {loadingDiagnostic ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Diagnóstico
          </Button>
          <Button onClick={() => setShowResetDialog(true)} variant="destructive" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Reiniciar Base de Datos
          </Button>
          <Button onClick={() => router.push("/inventory")}>Volver a Inventario</Button>
        </div>
      </div>

      {sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">No hay fuentes de importación configuradas</p>
            <Button className="mt-4" onClick={() => router.push("/inventory/sources/new")}>
              <Upload className="h-4 w-4 mr-2" />
              Crear Nueva Fuente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => {
            const isExpanded = expandedSources.has(source.id)
            const isRunning = runningImports.has(source.id) // Verificación si hay una importación activa en la DB
            const isInBackground = backgroundImports.has(source.id)

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
                  {/* Indicador de importación en segundo plano */}
                  {isInBackground && (
                    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-sm text-blue-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Importación en progreso</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setImporting(source.id)
                              setImportProgress(backgroundImports.get(source.id)!)
                              setShowProgressDialog(true)
                            }}
                            className="h-8 text-xs"
                          >
                            Ver progreso
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelImport(source.id)}
                            className="h-8 text-xs text-red-400 hover:text-red-300"
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {backgroundImports.get(source.id)!.processed} /{" "}
                        {backgroundImports.get(source.id)!.total > 0 ? backgroundImports.get(source.id)!.total : "N/A"}{" "}
                        productos (
                        {backgroundImports.get(source.id)!.total > 0
                          ? Math.round(
                              (backgroundImports.get(source.id)!.processed / backgroundImports.get(source.id)!.total) *
                                100,
                            )
                          : 0}
                        %)
                      </div>
                    </div>
                  )}

                  {/* Configuración expandible */}
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
                            <div className="break-all text-xs">{source.url_template}</div>
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

                  {/* Programación */}
                  {source.schedules.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Programación:</div>
                      <div className="space-y-2">
                        {source.schedules.map((schedule) => (
                          <div key={schedule.id} className="p-3 bg-muted rounded-md space-y-2 text-sm">
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

                  {/* Última importación */}
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
                                  : source.last_import.status === "cancelled"
                                    ? "warning"
                                    : "secondary"
                            }
                          >
                            {source.last_import.status === "success"
                              ? "Completada"
                              : source.last_import.status === "error"
                                ? "Error"
                                : source.last_import.status === "cancelled"
                                  ? "Cancelada"
                                  : "En curso"}
                          </Badge>
                          <span>
                            {source.last_import.products_imported} productos importados,{" "}
                            {source.last_import.products_updated} actualizados
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

                  {/* Botones de acción */}
                  <div className="flex gap-2 pt-4">
                    {importing === source.id || isRunning || isInBackground ? (
                      <>
                        {console.log("[v0] MOSTRANDO BOTÓN DE CANCELAR para source:", source.id, source.name)}
                        <Button
                          variant="ghost"
                          onClick={() => handleCancelImport(source.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          disabled={isExecutingRef.current} // Deshabilitar si otra acción está en curso
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancelar importación
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          handleRunImport(source)
                        }}
                        disabled={!!importing || isInBackground || isRunning || isExecutingRef.current}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Importar ahora
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => handleOpenScheduleDialog(source)}
                      title={
                        schedulesTableExists ? "Configurar cronjob" : "Cronjobs no disponibles (ejecuta script SQL 017)"
                      }
                      disabled={!schedulesTableExists || isExecutingRef.current}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Cronjob
                    </Button>
                    <Link href={`/inventory/sources/${source.id}/history`}>
                      <Button variant="outline" size="icon" title="Ver historial" disabled={isExecutingRef.current}>
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
                      disabled={isExecutingRef.current}
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

      {/* Dialog para confirmar eliminación */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Fuente</DialogTitle>
            <DialogDescription>¿Estás seguro de que quieres eliminar esta fuente de importación?</DialogDescription>
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

      {/* Dialog para configurar cronjob */}
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
                      <SelectValue placeholder="Selecciona una frecuencia" />
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
                      <SelectValue placeholder="Selecciona una zona horaria" />
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
                        <SelectValue placeholder="Selecciona un día" />
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
                        <SelectValue placeholder="Selecciona un día del mes" />
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

      {/* Dialog para confirmar antes de ejecutar importación */}
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
                console.log("[v0] ===== BOTÓN CONTINUAR CLICKEADO =====")
                console.log("[v0] isExecutingRef.current:", isExecutingRef.current)
                console.log("[v0] sourceToImport:", sourceToImport)

                if (isExecutingRef.current) {
                  console.log("[v0] BLOQUEADO: isExecutingRef ya está en true")
                  return
                }

                console.log("[v0] Marcando isExecutingRef como true")
                isExecutingRef.current = true

                if (sourceToImport) {
                  console.log("[v0] Ejecutando executeImport para:", sourceToImport.name)
                  executeImport(sourceToImport).finally(() => {
                    // Mover el reset a finally del executeImport para asegurar que se ejecute
                  })
                } else {
                  console.log("[v0] ERROR: sourceToImport es null")
                  isExecutingRef.current = false // Liberar si no hay fuente
                }
              }}
              variant={importMode === "overwrite" ? "destructive" : "default"}
            >
              {importMode === "overwrite" ? "Sobrescribir Todo" : "Continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para mostrar progreso de importación */}
      <Dialog
        open={showProgressDialog}
        onOpenChange={(open) => {
          if (!open) {
            // Mover a segundo plano en lugar de cancelar
            if (importing && importProgress.status === "running" && sourceToImport) {
              const updatedImports = new Map(backgroundImports)
              updatedImports.set(importing, { ...importProgress })
              setBackgroundImports(updatedImports)

              toast({
                title: "Importación en segundo plano",
                description: `La importación de "${sourceToImport.name}" continúa ejecutándose. Haz clic en "Ver progreso" desde la tarjeta de la fuente para reabrir el modal.`,
              })
            }
            // No cerrar el modal si se está ejecutando una acción crítica en finally
            // setShowProgressDialog(false) // El modal maneja su cierre con el botón X o cerrar overlay
            //setCurrentImportHistoryId(null) // No resetear, para permitir reabrir si es necesario
            setSourceToImport(null) // Resetear la fuente activa
            // No resetear isExecutingRef aquí, se hace en el finally de executeImport
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hourglass className="h-5 w-5 animate-pulse" />
              {importProgress.status === "running" && "Importación en Curso"}
              {importProgress.status === "completed" && "✅ Importación Completada"}
              {importProgress.status === "error" && "❌ Error en Importación"}
              {importProgress.status === "cancelled" && "⚠️ Importación Cancelada"}
            </DialogTitle>
            <DialogDescription>
              {importProgress.status === "running" && "Procesando productos..."}
              {importProgress.status === "completed" && "La importación se completó exitosamente"}
              {importProgress.status === "error" && "Ocurrió un error durante la importación"}
              {importProgress.status === "cancelled" && "La importación fue cancelada"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Indicador de actividad en tiempo real */}
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

            {/* Tiempos y velocidad */}
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
                  <div className="font-medium">{importProgress.speed.toFixed(1)} prod/s</div>
                </div>
              </div>
            )}

            {/* Estadísticas de importación */}
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
            {/* Agregar estadistica de skipped */}
            <div className="space-y-1 text-center">
              <div className="text-2xl font-bold text-gray-600">{importProgress.skipped}</div>
              <div className="text-xs text-muted-foreground">Saltados</div>
            </div>

            {/* Mensaje de estado o tiempo estimado */}
            {importProgress.status === "running" && importProgress.total > 0 && importProgress.speed > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {importProgress.total > importProgress.processed ? (
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
                  ) : (
                    "Calculando tiempo restante..."
                  )}
                </p>
              </div>
            )}

            {/* Errores */}
            {importProgress.errors.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-red-600">
                  Errores detectados ({importProgress.failed} de {importProgress.total}):
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {importProgress.errors.map((error, index) => (
                    <div
                      key={index}
                      className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs"
                    >
                      <div className="font-medium text-red-800 dark:text-red-200">SKU: {error.sku}</div>
                      <div className="text-red-700 dark:text-red-300 mt-1">{error.error}</div>
                      {error.details && (
                        <div className="text-red-600 dark:text-red-400 mt-1 text-[10px] break-words">
                          {error.details}
                        </div>
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
                  handleCancelImport() // Call without sourceId to target the active modal import
                }}
              >
                <StopCircle className="h-4 w-4 mr-2" />
                Cancelar Importación
              </Button>
            ) : (
              // Botón para cerrar cuando la importación ha finalizado
              <Button
                onClick={() => {
                  setShowProgressDialog(false)
                  //setCurrentImportHistoryId(null) // No resetear, para permitir reabrir si es necesario
                  setSourceToImport(null) // Resetear la fuente activa
                  setImporting(null) // Resetear el estado de 'importing'
                  // El flag isExecutingRef.current se resetea en el finally de executeImport
                }}
              >
                Cerrar
              </Button>
            )}
          </DialogFooter>

          {/* Información detallada del CSV si está disponible */}
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
                      {Object.entries(sourceToImport?.column_mapping || {}).map(([field, column]) => (
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

      {/* Dialog para mostrar datos del diagnóstico */}
      <Dialog open={showDiagnosticDialog} onOpenChange={setShowDiagnosticDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Diagnóstico de Productos</DialogTitle>
            <DialogDescription>Análisis del estado actual de la base de datos de productos</DialogDescription>
          </DialogHeader>

          {loadingDiagnostic ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : diagnosticData ? (
            <div className="space-y-4">
              {/* Estadísticas generales */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total de Productos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{diagnosticData.totalProducts}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">SKUs Duplicados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{diagnosticData.totalDuplicateSKUs || 0}</div>
                    {diagnosticData.totalDuplicateProducts > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {diagnosticData.totalDuplicateProducts} productos extras
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Productos por fuente */}
              {diagnosticData.productsBySource && diagnosticData.productsBySource.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Productos por Fuente</h3>
                  <div className="space-y-2">
                    {diagnosticData.productsBySource.map((item: any) => (
                      <div key={item.source} className="flex justify-between items-center p-2 bg-muted rounded">
                        <span>{item.source || "Sin fuente"}</span>
                        <Badge>{item.count} productos</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SKUs duplicados */}
              {diagnosticData.duplicateSKUs && diagnosticData.duplicateSKUs.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-red-600">
                    SKUs Duplicados ({diagnosticData.totalDuplicateSKUs || diagnosticData.duplicateSKUs.length})
                  </h3>
                  {diagnosticData.totalDuplicateProducts > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded mb-3">
                      <p className="text-sm font-semibold text-red-800">
                        ⚠️ Se encontraron {diagnosticData.totalDuplicateProducts} productos duplicados que deben
                        eliminarse
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        Se mantendrá el producto más antiguo de cada SKU duplicado
                      </p>
                    </div>
                  )}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {diagnosticData.duplicateSKUs.slice(0, 10).map((sku: string, index: number) => (
                      <div key={index} className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                        <span className="text-gray-900">SKU: </span>
                        <code className="font-mono text-gray-800">{sku}</code>
                      </div>
                    ))}
                    {diagnosticData.duplicateSKUs.length > 10 && (
                      <p className="text-sm text-muted-foreground">
                        ... y {diagnosticData.duplicateSKUs.length - 10} más
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Títulos corruptos */}
              {diagnosticData.corruptedTitles && diagnosticData.corruptedTitles.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-yellow-600">
                    Títulos Corruptos ({diagnosticData.corruptedTitles.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {diagnosticData.corruptedTitles.slice(0, 5).map((product: any, index: number) => (
                      <div
                        key={index}
                        className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-900"
                      >
                        <div>
                          <strong className="text-gray-900">SKU:</strong>{" "}
                          <span className="text-gray-800">{product.sku}</span>
                        </div>
                        <div>
                          <strong className="text-gray-900">Título:</strong>{" "}
                          <span className="text-gray-800">{product.title}</span>
                        </div>
                      </div>
                    ))}
                    {diagnosticData.corruptedTitles.length > 5 && (
                      <p className="text-sm text-gray-600">... y {diagnosticData.corruptedTitles.length - 5} más</p>
                    )}
                  </div>
                </div>
              )}

              {/* Mensaje de estado saludable */}
              {(!diagnosticData.duplicateSKUs || diagnosticData.duplicateSKUs.length === 0) &&
                (!diagnosticData.corruptedTitles || diagnosticData.corruptedTitles.length === 0) && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded text-center">
                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="font-semibold text-green-800">¡Base de datos saludable!</p>
                    <p className="text-sm text-green-600">No se detectaron problemas</p>
                  </div>
                )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No se encontraron datos de diagnóstico.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiagnosticDialog(false)}>
              Cerrar
            </Button>
            {diagnosticData?.totalDuplicateProducts > 0 && (
              <Button variant="destructive" onClick={handleCleanDuplicates} disabled={cleaningDuplicates}>
                {cleaningDuplicates ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Limpiando...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Limpiar {diagnosticData.totalDuplicateProducts} Duplicados
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para reiniciar la base de datos */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">⚠️ Reiniciar Base de Datos</DialogTitle>
            <DialogDescription>
              Esta acción eliminará TODOS los productos de la base de datos. Esta acción NO se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200 mb-4">
                <strong>Advertencia crítica:</strong> Se eliminarán permanently todos los productos.
              </p>
              <p className="text-sm text-red-800 dark:text-red-200">
                Después de eliminar, deberás ejecutar las importaciones en este orden:
              </p>
              <ol className="list-decimal list-inside text-sm text-red-800 dark:text-red-200 mt-2 space-y-1">
                <li>
                  <strong>Arnoia</strong> - Catálogo completo (base principal)
                </li>
                <li>
                  <strong>Arnoia Act</strong> - Productos nuevos y actualizaciones
                </li>
                <li>
                  <strong>Arnoia Stock</strong> - Actualización de stock y precios
                </li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-text">
                Para confirmar, escribe <strong>ELIMINAR TODO</strong> en el campo de abajo:
              </Label>
              <Input
                id="confirm-text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="ELIMINAR TODO"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResetDialog(false)
                setResetConfirmText("")
              }}
              disabled={resetLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResetDatabase}
              variant="destructive"
              disabled={resetConfirmText !== "ELIMINAR TODO" || resetLoading}
            >
              {resetLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar Todo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} // Cierre de la función App

export default App // Exportar el componente App
