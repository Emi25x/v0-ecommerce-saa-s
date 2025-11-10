"use client"

import { useEffect, useState, useRef } from "react" // Importar useRef
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
import Papa from "papaparse" // Importar PapaParse
import { useRouter } from "next/navigation" // Importar useRouter

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
  status: "running" | "completed" | "cancelled" | "error"
  startTime: Date | null
  lastUpdate: Date | null
  speed: number
  errors: Array<{ sku: string; message: string; details?: string }> // details ahora es opcional
  csvInfo: null | {
    separator: string
    headers: string[]
    firstRow: Record<string, string>
  }
}

export default function ImportSourcesPage() {
  const router = useRouter() // Inicializar useRouter
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

  const isExecutingRef = useRef(false)

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
      return sourcesWithSchedules // Retornar para uso en la función executeImport
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
  }

  async function handleRunImport(source: SourceWithSchedule) {
    if (isExecutingRef.current) {
      return
    }

    setSourceToImport(source)
    setImportMode("update")
    setShowImportConfirmDialog(true)
  }

  async function executeImport(source: SourceWithSchedule) {
    let historyId: string | undefined // Declarar historyId aquí
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

      const parsed = Papa.parse(csvText, {
        header: true,
        delimiter: detectedSeparator,
        skipEmptyLines: true,
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

      const products = parsed.data as Record<string, any>[] // Asumiendo que los datos son un array de objetos
      console.log("[v0] Total de productos en el CSV:", products.length)
      console.log("[v0] Primera fila de datos:", products[0])

      setImportProgress((prev) => ({
        ...prev,
        total: products.length,
        csvInfo: {
          separator: detectedSeparator,
          headers: Object.keys(products[0] || {}),
          firstRow: products[0] || {},
        },
      }))

      const supabase = await createClient()

      // Crear registro de importación
      const { data: historyRecord, error: historyError } = await supabase
        .from("import_history")
        .insert({
          source_id: source.id,
          status: "running",
          products_imported: 0,
          products_updated: 0,
          products_failed: 0,
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (historyError) {
        console.error("[v0] Error al crear registro de historial:", historyError)
        toast({
          title: "Error de base de datos",
          description: `No se pudo crear el registro de historial: ${historyError.message}`,
          variant: "destructive",
        })
        return // Salir si no se puede crear el historial
      }

      historyId = historyRecord?.id // Asignar a la variable declarada

      // Detectar si la fuente solo tiene datos básicos (precio/stock)
      const firstProduct: any = products[0] || {}
      const hasName = firstProduct.name || firstProduct.title || firstProduct.descripcion
      const hasCategory = firstProduct.category || firstProduct.categoria || firstProduct.rubro
      const hasPrice = firstProduct.price || firstProduct.precio || firstProduct.pventa
      const hasSku =
        firstProduct.sku || firstProduct.codigo || firstProduct.barcode || firstProduct.ean || firstProduct.upc

      const hasOnlyBasicData = hasSku && hasPrice && !hasName && !hasCategory
      console.log("[v0] ¿La fuente solo tiene datos básicos (precio/stock)?", hasOnlyBasicData)

      let backupSources: SourceWithSchedule[] = []
      const backupProducts: Map<string, any> = new Map()

      if (hasOnlyBasicData && hasSku) {
        console.log("[v0] Buscando fuentes de respaldo para productos faltantes...")

        // Obtener todas las fuentes para buscar las de respaldo
        const allCurrentSources = await loadSources() // Cargar las fuentes actuales

        backupSources = allCurrentSources
          .filter((s) => s.id !== source.id && s.url_template && s.name.toLowerCase().includes("arnoia")) // Filtra por URL y nombre que incluya "Arnoia"
          .sort((a, b) => {
            // Priorizar "Arnoia" sin "Act" en el nombre
            const aIsArnoia = a.name.toLowerCase().includes("arnoia") && !a.name.toLowerCase().includes("act")
            const bIsArnoia = b.name.toLowerCase().includes("arnoia") && !b.name.toLowerCase().includes("act")
            if (aIsArnoia && !bIsArnoia) return -1
            if (!aIsArnoia && bIsArnoia) return 1
            return a.name.localeCompare(b.name)
          })

        console.log(
          "[v0] Fuentes de respaldo encontradas:",
          backupSources.map((s) => s.name),
        )

        // Descargar y parsear CSVs de respaldo
        for (const backupSource of backupSources) {
          try {
            console.log("[v0] Descargando fuente de respaldo:", backupSource.name)
            const backupCsvResponse = await fetch(backupSource.url_template!)
            if (!backupCsvResponse.ok) {
              console.warn(`[v0] No se pudo descargar ${backupSource.name}: ${backupCsvResponse.statusText}`)
              continue
            }

            const backupCsvText = await backupCsvResponse.text()
            const backupDetectedSeparator = detectSeparator(backupCsvText)
            const backupParsed = Papa.parse(backupCsvText, {
              header: true,
              delimiter: backupDetectedSeparator,
              skipEmptyLines: true,
            })

            if (backupParsed.errors.length > 0) {
              console.warn(`[v0] Errores al parsear CSV de ${backupSource.name}:`, backupParsed.errors)
            }

            for (const row of backupParsed.data as any[]) {
              // Normalizar los SKUs de respaldo para asegurar la comparación (toUpperCase, trim)
              const backupSku = (row.sku || row.codigo || row.barcode || row.ean || row.upc)
                ?.toString()
                .trim()
                .toUpperCase()
              if (backupSku) {
                backupProducts.set(backupSku, row)
              }
            }

            console.log("[v0] Productos cargados de", backupSource.name, ":", backupParsed.data.length)
          } catch (error) {
            console.error("[v0] Error al cargar fuente de respaldo:", backupSource.name, error)
          }
        }

        console.log("[v0] Total de productos de respaldo disponibles:", backupProducts.size)
      }

      // Procesar productos en batches
      const BATCH_SIZE = 50
      const batches: Record<string, any>[][] = [] // Explicit type
      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        batches.push(products.slice(i, i + BATCH_SIZE))
      }

      console.log("[v0] Total de batches a procesar:", batches.length)
      console.log("[v0] Tamaño de cada batch:", BATCH_SIZE)

      let totalImported = 0
      let totalUpdated = 0
      let totalFailed = 0
      const allErrors: Array<{ sku: string; error: string; details?: string }> = [] // details ahora es opcional

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        // Verificar si la importación fue cancelada
        if (importProgress.status === "cancelled") {
          console.log("[v0] Importación cancelada por el usuario")
          break
        }

        const batch = batches[batchIndex]
        console.log(`[v0] Procesando batch ${batchIndex + 1}/${batches.length}`)

        // Obtener todos los SKUs del batch para consulta masiva
        const skus = batch
          .map((row: any) => {
            // Normalizar SKUs para la consulta
            const sku = (row.sku || row.codigo || row.barcode || row.ean || row.upc)?.toString().trim().toUpperCase()
            return sku
          })
          .filter(Boolean) // Eliminar SKUs nulos o vacíos

        // Si no hay SKUs válidos en el batch, continuar al siguiente
        if (skus.length === 0) {
          console.log("[v0] Batch sin SKUs válidos, saltando.")
          continue
        }

        // Consulta masiva de productos existentes
        const { data: existingProducts } = await supabase.from("products").select("sku, id, source").in("sku", skus)

        const existingProductsMap = new Map(existingProducts?.map((p) => [p.sku, p]) || [])

        // Procesar todos los productos del batch en paralelo
        const batchResults = await Promise.allSettled(
          batch.map(async (row: any) => {
            const rawSku = row.sku || row.codigo || row.barcode || row.ean || row.upc
            if (!rawSku) {
              throw new Error("SKU no encontrado en el producto")
            }
            const sku = rawSku.toString().trim().toUpperCase() // Normalizar SKU

            // Mapeo de campos de la fuente actual
            const name = row.name || row.title || row.descripcion || row.product
            const description = row.description || row.descripcion || row.detalle
            const category = row.category || row.categoria || row.rubro
            const brand = row.brand || row.marca || row.fabricante
            const price = row.price || row.precio || row.pventa
            const stock = row.stock || row.quantity || row.existencia || row.qty

            // Validar si el precio o stock son números válidos
            const parsedPrice = Number.parseFloat(price)
            const validPrice = !isNaN(parsedPrice) ? parsedPrice : 0
            const parsedStock = Number.parseInt(stock)
            const validStock = !isNaN(parsedStock) ? parsedStock : 0

            const existingProduct = existingProductsMap.get(sku)

            // Si el producto no existe y solo tenemos datos básicos, buscar en fuentes de respaldo
            if (!existingProduct && hasOnlyBasicData && hasSku) {
              const backupProductData = backupProducts.get(sku) // Ya normalizado al cargarlo

              if (backupProductData) {
                console.log(`[v0] Producto ${sku} no existe, encontrado en fuente de respaldo`)

                // Mapeo de campos de la fuente de respaldo
                const backupName =
                  backupProductData.name ||
                  backupProductData.title ||
                  backupProductData.descripcion ||
                  backupProductData.product ||
                  sku
                const backupDescription =
                  backupProductData.description || backupProductData.descripcion || backupProductData.detalle
                const backupCategory =
                  backupProductData.category || backupProductData.categoria || backupProductData.rubro
                const backupBrand = backupProductData.brand || backupProductData.marca || backupProductData.fabricante
                const backupPrice = Number.parseFloat(
                  backupProductData.price || backupProductData.precio || backupProductData.pventa,
                )
                const backupStock = Number.parseInt(
                  backupProductData.stock ||
                    backupProductData.quantity ||
                    backupProductData.existencia ||
                    backupProductData.qty,
                )

                const productData = {
                  sku,
                  title: backupName || sku, // Asegurar título
                  description: backupDescription,
                  category: backupCategory,
                  brand: backupBrand,
                  price: isNaN(backupPrice) ? validPrice : backupPrice, // Usar precio de respaldo si es válido, si no, el de la fuente actual
                  stock: isNaN(backupStock) ? validStock : backupStock, // Usar stock de respaldo si es válido, si no, el de la fuente actual
                  source: [source.id], // Añadir la fuente actual
                }

                const { error: insertError } = await supabase.from("products").insert(productData)

                if (insertError) throw insertError
                return { type: "inserted", sku }
              } else {
                // No se encontró en fuentes de respaldo, saltar
                throw new Error(`Producto ${sku} no encontrado en fuentes de respaldo.`)
              }
            }

            const productData: any = {
              sku,
              title: name || sku, // Asegurar título
              description,
              category,
              brand,
              price: validPrice,
              stock: validStock,
            }

            if (existingProduct) {
              // Producto existe - Actualizar
              if (importMode === "skip") {
                console.log(`[v0] Producto ${sku} ya existe, saltando (modo skip).`)
                return { type: "skipped", sku } // Marcar como saltado explícitamente
              }

              const currentSources = Array.isArray(existingProduct.source) ? existingProduct.source : []
              if (!currentSources.includes(source.id)) {
                productData.source = [...currentSources, source.id]
              }

              const { error: updateError } = await supabase
                .from("products")
                .update(productData)
                .eq("id", existingProduct.id)

              if (updateError) throw updateError
              return { type: "updated", sku }
            } else {
              // Producto NO existe - Insertar
              if (importMode === "skip") {
                throw new Error(`Producto ${sku} no existe y no se puede crear en modo skip.`)
              }
              productData.source = [source.id]

              const { error: insertError } = await supabase.from("products").insert(productData)

              if (insertError) throw insertError
              return { type: "inserted", sku }
            }
          }),
        )

        // Contar resultados del batch
        let batchImported = 0
        let batchUpdated = 0
        let batchFailed = 0
        let batchSkipped = 0

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            const { value } = result as { status: "fulfilled"; value: { type: string; sku: string } }
            if (value.type === "inserted") {
              batchImported++
            } else if (value.type === "updated") {
              batchUpdated++
            } else if (value.type === "skipped") {
              batchSkipped++
            }
          } else {
            batchFailed++
            const error = result.reason
            const errorMessage = error?.message || "Error desconocido"
            // Intentar obtener el SKU del error si no está en el mensaje
            let skuFromError = "Desconocido"
            if (error?.message && error.message.includes("SKU:")) {
              const match = error.message.match(/SKU:([^,]+)/)
              if (match && match[1]) {
                skuFromError = match[1].trim()
              }
            } else if (
              typeof error === "object" &&
              error !== null &&
              "details" in error &&
              typeof error.details === "string" &&
              error.details.includes("SKU:")
            ) {
              const match = error.details.match(/SKU:([^,]+)/)
              if (match && match[1]) {
                skuFromError = match[1].trim()
              }
            } else if (typeof error === "object" && error !== null && "message" in error) {
              // Intenta extraer el SKU si está en el mensaje de error de Supabase
              const supabaseSkuMatch = error.message.match(/DETAIL: Key $$sku$$=$$([^)]+)$$ already exists/)
              if (supabaseSkuMatch && supabaseSkuMatch[1]) {
                skuFromError = supabaseSkuMatch[1]
              }
            }

            // Registrar error si no es un "saltado" por el modo skip
            if (
              !(
                errorMessage.includes("saltando (modo skip)") || errorMessage.includes("no se puede crear en modo skip")
              )
            ) {
              allErrors.push({
                sku: skuFromError || "Desconocido",
                error: errorMessage,
                details: typeof error === "object" && error !== null && "details" in error ? error.details : undefined, // Registrar detalles si existen
              })
            }
          }
        }

        totalImported += batchImported
        totalUpdated += batchUpdated
        totalFailed += batchFailed
        // Los skipped no cuentan como failed, son un resultado esperado en algunos modos.

        // Actualizar progreso general
        const processedCount = (batchIndex + 1) * BATCH_SIZE
        const elapsed = (new Date().getTime() - now.getTime()) / 1000
        const speed = elapsed > 0 ? processedCount / elapsed : 0

        setImportProgress((prev) => ({
          ...prev,
          processed: Math.min(processedCount, products.length),
          imported: totalImported,
          updated: totalUpdated,
          failed: totalFailed,
          speed: isFinite(speed) ? speed : 0, // Asegurar que speed sea un número finito
          errors: allErrors.slice(0, 5), // Mostrar solo los primeros 5 errores
          lastUpdate: new Date(),
        }))

        // Actualizar estado en segundo plano si el modal está cerrado
        if (!showProgressDialog) {
          setBackgroundImports((prev) =>
            new Map(prev).set(source.id, {
              total: products.length,
              processed: Math.min(processedCount, products.length),
              imported: totalImported,
              updated: totalUpdated,
              failed: totalFailed,
              status: "running",
              startTime: now,
              lastUpdate: new Date(),
              speed: isFinite(speed) ? speed : 0,
              errors: allErrors.slice(0, 5),
              csvInfo: null, // No enviar csvInfo al fondo
            }),
          )
        }
      }

      // Finalizar importación
      const finalStatus = importProgress.status === "cancelled" ? "cancelled" : totalFailed > 0 ? "error" : "success"
      const finalMessage =
        totalFailed > 0 && importProgress.status !== "cancelled" ? `Se encontraron ${totalFailed} errores.` : ""

      if (historyId) {
        await supabase
          .from("import_history")
          .update({
            status: finalStatus,
            products_imported: totalImported,
            products_updated: totalUpdated,
            products_failed: totalFailed,
            finished_at: new Date().toISOString(),
            error_message:
              finalStatus === "error"
                ? allErrors
                    .slice(0, 3)
                    .map((e) => `${e.sku}: ${e.error}`)
                    .join("; ")
                : null, // Guardar un resumen de los errores
          })
          .eq("id", historyId)
      }

      setImportProgress((prev) => ({
        ...prev,
        status: finalStatus,
        failed: totalFailed, // Asegurarse que el estado final refleje los fallos
        errors: allErrors, // Guardar todos los errores
      }))

      // Limpiar de segundo plano si ya no está en ejecución
      setBackgroundImports((prev) => {
        const updated = new Map(prev)
        updated.delete(source.id)
        return updated
      })

      if (importProgress.status !== "cancelled") {
        if (finalStatus === "success") {
          toast({
            title: "Importación completada",
            description: `${totalImported} productos importados, ${totalUpdated} actualizados`,
          })
        } else if (finalStatus === "error") {
          toast({
            title: "Importación con errores",
            description: `Se completó con ${totalFailed} productos fallidos. Verifica los detalles.`,
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

      loadSources() // Recargar la lista de fuentes para actualizar el estado
    } catch (error: any) {
      console.error("[v0] ===== ERROR EN IMPORTACIÓN =====")
      console.error("[v0] Error:", error)
      console.error("Error stack:", error.stack) // Log stack trace for debugging
      setImportProgress((prev) => ({
        ...prev,
        status: "error",
        errors: [{ sku: "Global", message: error.message, details: error.stack || "" }],
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

      // Intentar actualizar el historial de importación a 'error' si existe
      if (historyId) {
        await supabase
          .from("import_history")
          .update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: `Error crítico: ${error.message}`,
          })
          .eq("id", historyId)
      }
    } finally {
      setImporting(null)
      setShowImportConfirmDialog(false)
      setSourceToImport(null)

      // Solo cerrar el modal si la importación terminó completamente
      if (importProgress.status !== "running") {
        setShowProgressDialog(false)
        setCurrentImportHistoryId(null)
      }

      // Asegurar que se puede ejecutar otra importación después de 2 segundos
      setTimeout(() => {
        isExecutingRef.current = false
      }, 2000)
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
      if (importing && showProgressDialog) {
        // Check if the progress modal is open
        console.log(`[v0] Cancelando importación activa en diálogo: ${importing}`)

        setImportProgress((prev) => ({ ...prev, status: "cancelled" })) // Update status locally

        // Limpiar el estado de importación y cerrar el modal
        setImporting(null)
        setShowProgressDialog(false)
        setShowImportConfirmDialog(false)
        setSourceToImport(null)
        //setCurrentImportHistoryId(null) // No resetear para permitir reabrir si se mueve a segundo plano

        // Actualizar el historial si existe
        if (currentImportHistoryId) {
          await supabase
            .from("import_history")
            .update({
              status: "cancelled",
              finished_at: new Date().toISOString(),
              error_message: "Importación cancelada por el usuario",
            })
            .eq("id", currentImportHistoryId)
        }

        toast({
          title: "Importación cancelada",
          description: "La importación ha sido detenida.",
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

          // Actualizar el historial si existe
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
                finished_at: new Date().toISOString(),
                error_message: "Importación cancelada por el usuario",
              })
              .eq("id", runningHistory.id)
          }

          toast({
            title: "Importación cancelada",
            description: "La importación en segundo plano ha sido detenida.",
          })

          loadSources()
          return
        }
      }

      toast({
        title: "Nada que cancelar",
        description: "No hay importaciones activas.",
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold">Gestor de Importaciones</h1>
          <p className="text-muted-foreground mt-2">Administra tus fuentes de importación y sus configuraciones</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/inventory">Volver a Inventario</Link>
          </Button>
          <Button onClick={() => router.push("/inventory/sources/new")}>
            <Upload className="h-4 w-4 mr-2" />
            Nueva Fuente
          </Button>
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
                  {backgroundImports.has(source.id) && (
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
                        {backgroundImports.get(source.id)!.processed} / {backgroundImports.get(source.id)!.total}{" "}
                        productos (
                        {Math.round(
                          (backgroundImports.get(source.id)!.processed / backgroundImports.get(source.id)!.total) * 100,
                        )}
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
                    {importing === source.id || source.last_import?.status === "in_progress" ? (
                      <>
                        {console.log("[v0] MOSTRANDO BOTÓN DE CANCELAR para source:", source.id, source.name)}
                        <Button
                          variant="ghost"
                          onClick={() => handleCancelImport(source.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancelar importación
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          console.log("[v0] Click en botón Importar ahora")
                          console.log("[v0] importing:", importing)
                          console.log("[v0] backgroundImports.has(source.id):", backgroundImports.has(source.id))
                          console.log("[v0] isRunning:", isRunning)
                          console.log("[v0] isExecutingRef.current:", isExecutingRef.current)
                          handleRunImport(source)
                        }}
                        disabled={
                          !!importing || backgroundImports.has(source.id) || isRunning || isExecutingRef.current
                        } // Deshabilitar si ya hay una importación en curso (db, background, o configuración iniciada)
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
                // Prevenir doble clic
                if (isExecutingRef.current) {
                  console.log("[v0] Importación ya iniciándose, ignorando clic")
                  return
                }

                isExecutingRef.current = true
                console.log("[v0] ========================================")
                console.log("[v0] Botón CONTINUAR presionado")
                console.log("[v0] sourceToImport:", sourceToImport?.name, "ID:", sourceToImport?.id)
                console.log("[v0] importMode:", importMode)
                console.log("[v0] ========================================")

                if (sourceToImport) {
                  executeImport(sourceToImport).finally(() => {
                    // Liberar después de 2 segundos para evitar clicks accidentales
                    setTimeout(() => {
                      isExecutingRef.current = false
                    }, 2000)
                  })
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
            if (importing && importProgress.status === "running") {
              const updatedImports = new Map(backgroundImports)
              updatedImports.set(importing, { ...importProgress })
              setBackgroundImports(updatedImports)

              toast({
                title: "Importación en segundo plano",
                description: `La importación de "${sourceToImport?.name}" continúa ejecutándose. Haz clic en "Ver progreso" desde la tarjeta de la fuente para reabrir el modal.`,
              })
            }
            setShowProgressDialog(false)
            // Al cerrar manualmente (no completar), resetear el historial ID para evitar reabrir un modal incorrecto
            //setCurrentImportHistoryId(null); // No resetear para permitir reabrir si es necesario
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Hourglass className="h-5 w-5 animate-pulse" />
                {importProgress.status === "running" && "Importación en Curso"}
                {importProgress.status === "completed" && "✅ Importación Completada"}
                {importProgress.status === "error" && "❌ Error en Importación"}
                {importProgress.status === "cancelled" && "⚠️ Importación Cancelada"}
              </DialogTitle>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleCancelImport()}
                disabled={importProgress.status !== "running"}
              >
                <X className="h-4 w-4 mr-1" />
                Cancelar Importación
              </Button>
            </div>
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

            {/* Mensaje de estado o tiempo estimado */}
            {importProgress.status === "running" && importProgress.total > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {importProgress.speed > 0 && importProgress.total > importProgress.processed ? (
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
                  if (sourceToImport) {
                    handleCancelImport() // Call without sourceId to target the active modal import
                  }
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
    </div>
  )
}
