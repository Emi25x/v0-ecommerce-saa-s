"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { toast } from "@/hooks/use-toast"
import Papa from "papaparse"
import type {
  SourceWithSchedule,
  ImportProgressState,
  INITIAL_IMPORT_PROGRESS,
} from "@/components/inventory/sources/types"

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

async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key must be set in environment variables.")
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export function useImportSources() {
  const router = useRouter()

  const [showDiagnosticDialog, setShowDiagnosticDialog] = useState(false)
  const [diagnosticData, setDiagnosticData] = useState<any>(null)
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false)
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState("")
  const [runningCron, setRunningCron] = useState(false)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)

  const [sources, setSources] = useState<SourceWithSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSource, setSelectedSource] = useState<SourceWithSchedule | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [runningImports, setRunningImports] = useState<Map<string, string>>(new Map())
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [schedulesTableExists, setSchedulesTableExists] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())
  const [sourceToImport, setSourceToImport] = useState<SourceWithSchedule | null>(null)
  const [showProgressDialog, setShowProgressDialog] = useState(false)
  const [backgroundImports, setBackgroundImports] = useState<Map<string, ImportProgressState>>(new Map())
  const [importProgress, setImportProgress] = useState<ImportProgressState>({
    total: 0,
    processed: 0,
    imported: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
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
  const [exportingConfig, setExportingConfig] = useState(false)
  const [restoringConfig, setRestoringConfig] = useState(false)

  const isExecutingRef = useRef(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key",
  )

  const extractFieldValue = useCallback(
    (row: Record<string, any>, fieldName: string, mapping: Record<string, string>) => {
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
  )

  const loadSources = useCallback(async () => {
    try {
      setLoading(true)
      const { data: sourcesData, error: sourcesError } = await supabase
        .from("import_sources")
        .select("*")
        .order("created_at", { ascending: false })

      if (sourcesError) throw sourcesError

      let schedulesData: any[] = []
      const { data: schedules, error: schedulesError } = await supabase.from("import_schedules").select("*")
      if (schedulesError) {
        setSchedulesTableExists(false)
      } else {
        schedulesData = schedules || []
        setSchedulesTableExists(true)
      }

      const { data: historyData, error: historyError } = await supabase
        .from("import_history")
        .select("source_id, started_at, status, products_imported, products_updated, products_failed")
        .order("started_at", { ascending: false })

      if (historyError) {
        console.log("No se pudo cargar el historial:", historyError.message)
      }

      const uniqueSourcesMap = new Map()
      ;(sourcesData || []).forEach((source) => {
        if (!uniqueSourcesMap.has(source.id)) {
          uniqueSourcesMap.set(source.id, source)
        }
      })
      const uniqueSources = Array.from(uniqueSourcesMap.values())

      const sourcesWithSchedules: SourceWithSchedule[] = uniqueSources.map((source) => ({
        ...source,
        schedules: schedulesData.filter((s) => s.source_id === source.id),
        last_import: historyData?.find((h) => h.source_id === source.id),
      }))

      setSources(sourcesWithSchedules)
      return sourcesWithSchedules
    } catch (error) {
      console.error("Error loading sources:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las fuentes de importación",
        variant: "destructive",
      })
      return []
    } finally {
      setLoading(false)
    }
  }, [supabase])

  async function handleExportConfig() {
    setExportingConfig(true)
    try {
      const res = await fetch("/api/inventory/sources/export-config")
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `import_sources_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Configuración exportada", description: "El archivo JSON fue descargado." })
    } catch (e: any) {
      toast({ title: "Error al exportar", description: e.message, variant: "destructive" })
    } finally {
      setExportingConfig(false)
    }
  }

  async function handleRestoreConfig() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,application/json"
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      setRestoringConfig(true)
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        const res = await fetch("/api/inventory/sources/import-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || `Error ${res.status}`)
        toast({
          title: "Config restaurada",
          description: `${result.restored} fuentes actualizadas: ${result.names.join(", ")}`,
        })
        loadSources()
      } catch (e: any) {
        toast({ title: "Error al restaurar", description: e.message, variant: "destructive" })
      } finally {
        setRestoringConfig(false)
      }
    }
    input.click()
  }

  function handleRunImport(source: SourceWithSchedule) {
    if (isExecutingRef.current) return

    let defaultMode = "create"
    if (source.feed_type === "catalog") {
      defaultMode = "create"
    } else if (source.feed_type === "stock_price" || source.name.toLowerCase().includes("stock")) {
      defaultMode = "update"
    } else if (source.feed_type === "update") {
      defaultMode = "update"
    }

    const encodedName = encodeURIComponent(source.name)
    router.push(`/inventory/sources/batch-import?sourceId=${source.id}&name=${encodedName}&mode=${defaultMode}`)
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
          skipped: 0,
          status: "running",
          startTime: now,
          lastUpdate: now,
          speed: 0,
          errors: [],
          csvInfo: null,
        })

        if (!source.url_template) {
          throw new Error("La fuente no tiene una URL configurada")
        }

        const csvResponse = await fetch(source.url_template)
        if (!csvResponse.ok) {
          throw new Error(`Error al descargar el CSV: ${csvResponse.statusText}`)
        }

        const csvText = await csvResponse.text()
        const detectedSeparator = detectSeparator(csvText)

        const parsed = Papa.parse<Record<string, any>>(csvText, {
          header: true,
          skipEmptyLines: true,
          delimiter: detectedSeparator,
          transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, "_"),
        })

        if (parsed.errors.length > 0) {
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

        const allProducts = parsed.data as Record<string, any>[]

        setImportProgress((prev) => ({
          ...prev,
          total: allProducts.length,
          csvInfo: {
            separator: detectedSeparator,
            headers: Object.keys(allProducts[0] || {}),
            firstRow: allProducts[0] || {},
          },
        }))

        const supabaseClient = await createClient()

        const insertData: any = {
          source_id: source.id,
          status: "running",
          products_imported: 0,
          products_updated: 0,
          products_failed: 0,
          started_at: new Date().toISOString(),
        }

        try {
          const { data: tableInfo, error: tableInfoError } = await supabaseClient.rpc("get_column_info", {
            table_name: "import_history",
            column_name: "products_skipped",
          })
          if (!tableInfoError && tableInfo && tableInfo.length > 0) {
            insertData.products_skipped = 0
          }
        } catch (e) {
          // Continue without products_skipped
        }

        const { data: historyRecord, error: historyError } = await supabaseClient
          .from("import_history")
          .insert(insertData)
          .select()
          .single()

        if (historyError || !historyRecord) {
          throw new Error("No se pudo crear el registro de historial")
        }

        historyId = historyRecord.id
        setCurrentImportHistoryId(historyId ?? null)

        let backupSources: SourceWithSchedule[] = []
        const backupProducts: Map<string, any> = new Map()
        const missingSkus: string[] = []

        if (source.feed_type === "stock_price") {
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

          for (const backupSource of backupSources) {
            try {
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
            } catch (error) {
              console.error("Error al cargar fuente de respaldo:", backupSource.name, error)
            }
          }
        }

        const BATCH_SIZE = 200
        let totalImported = 0
        let totalUpdated = 0
        let totalFailed = 0
        let totalSkipped = 0
        let totalFromBackup = 0
        const allErrors: Array<{ sku: string; error: string; details?: string }> = []

        for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
          if (importProgress.status === "cancelled") break

          const batch = allProducts.slice(i, i + BATCH_SIZE)

          const skusInBatch = batch
            .map((row: any) => {
              const sku = (row.sku || row.codigo_interno || row.codigo || row.barcode || row.ean || row.upc)
                ?.toString()
                .trim()
                .toUpperCase()
              return sku
            })
            .filter(Boolean)

          if (skusInBatch.length === 0) continue

          const { data: existingProducts } = await supabaseClient
            .from("products")
            .select("sku, id, source, title")
            .in("sku", skusInBatch)
          const existingProductsMap = new Map(existingProducts?.map((p) => [p.sku, p]) || [])

          const results = await Promise.allSettled(
            batch.map(async (row: any) => {
              let sku: string | undefined
              try {
                sku = extractFieldValue(row, "sku", source.column_mapping)?.toString().trim().toUpperCase()
                if (!sku) return { type: "error", error: "Sin SKU válido", row }

                const title = extractFieldValue(row, "title", source.column_mapping)
                const description = extractFieldValue(row, "description", source.column_mapping)
                const category = extractFieldValue(row, "category", source.column_mapping)
                const brand = extractFieldValue(row, "brand", source.column_mapping)
                const priceValue = extractFieldValue(row, "price", source.column_mapping)
                const stockValue = extractFieldValue(row, "stock", source.column_mapping)

                let ean = extractFieldValue(row, "ean", source.column_mapping)
                if (ean) {
                  ean = String(ean).trim().replace(/^0+/, "") || ean
                }

                const parsedPrice = Number.parseFloat(priceValue)
                const validPrice = !isNaN(parsedPrice) ? parsedPrice : 0
                const parsedStock = Number.parseInt(stockValue)
                const validStock = !isNaN(parsedStock) ? parsedStock : 0

                const existingProduct = existingProductsMap.get(sku)

                if (existingProduct) {
                  if (source.feed_type === "catalog") {
                    const updateData: any = {
                      price: validPrice,
                      stock: validStock,
                      updated_at: new Date().toISOString(),
                    }
                    if (ean) updateData.ean = ean
                    if (title && title !== existingProduct.title) {
                      updateData.title = title
                      updateData.description = description
                      updateData.category = category
                      updateData.brand = brand
                    }
                    await supabaseClient.from("products").update(updateData).eq("id", existingProduct.id)
                    return { type: "updated" }
                  } else if (source.feed_type === "stock_price") {
                    await supabaseClient
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
                  if (source.feed_type === "stock_price") {
                    const backupProduct = backupProducts.get(sku)
                    if (backupProduct) {
                      const backupTitle = extractFieldValue(backupProduct, "title", source.column_mapping)
                      const backupDescription = extractFieldValue(backupProduct, "description", source.column_mapping)
                      const backupCategory = extractFieldValue(backupProduct, "category", source.column_mapping)
                      const backupBrand = extractFieldValue(backupProduct, "brand", source.column_mapping)

                      await supabaseClient.from("products").insert({
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
                    await supabaseClient.from("products").insert({
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

          for (const result of results) {
            if (result.status === "fulfilled") {
              const value = result.value as any
              if (value?.type === "imported" || value?.type === "imported_from_backup") {
                totalImported++
                if (value.type === "imported_from_backup") totalFromBackup++
              } else if (value?.type === "updated") {
                totalUpdated++
              } else if (value?.type === "skipped") {
                totalSkipped++
              } else if (value?.type === "error") {
                totalFailed++
                allErrors.push({ sku: value.sku || "desconocido", error: value.error || "Error desconocido" })
              }
            } else {
              totalFailed++
              allErrors.push({ sku: "desconocido", error: result.reason?.message || "Error desconocido" })
            }
          }

          const nowBatch = new Date()
          const elapsedSeconds =
            (nowBatch.getTime() - (importProgress.startTime?.getTime() || nowBatch.getTime())) / 1000
          const speed = elapsedSeconds > 0 ? (i + batch.length) / elapsedSeconds : 0

          setImportProgress((prev) => ({
            ...prev,
            processed: i + batch.length,
            imported: totalImported,
            updated: totalUpdated,
            failed: totalFailed,
            skipped: totalSkipped,
            lastUpdate: nowBatch,
            speed,
            errors: allErrors.slice(-10),
          }))
        }

        const finalStatus =
          importProgress.status === "cancelled" ? "cancelled" : totalFailed > 0 ? "completed_with_errors" : "completed"

        const updateData: any = {
          status: finalStatus,
          completed_at: new Date().toISOString(),
          products_imported: totalImported,
          products_updated: totalUpdated,
          products_failed: totalFailed,
        }

        try {
          const { data: tableInfo, error: tableInfoError } = await supabaseClient.rpc("get_column_info", {
            table_name: "import_history",
            column_name: "products_skipped",
          })
          if (!tableInfoError && tableInfo && tableInfo.length > 0) {
            updateData.products_skipped = totalSkipped
          }
        } catch (e) {
          // Continue without products_skipped
        }

        await supabaseClient.from("import_history").update(updateData).eq("id", historyId)

        setImportProgress((prev) => ({
          ...prev,
          status: finalStatus === "cancelled" ? "cancelled" : "completed",
        }))

        toast({
          title: "Importación completada",
          description: `Importados: ${totalImported} | Actualizados: ${totalUpdated} | Fallidos: ${totalFailed} | Saltados: ${totalSkipped}${totalFromBackup > 0 ? ` | Desde respaldo: ${totalFromBackup}` : ""}`,
        })

        await loadSources()
      } catch (error: any) {
        console.error("Error en importación:", error)
        setImportProgress((prev) => ({ ...prev, status: "error" }))

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
    [extractFieldValue, importMode, importProgress.startTime, importProgress.status, loadSources, supabase],
  )

  function handleDeleteSource(source: SourceWithSchedule) {
    setSelectedSource(source)
    setShowDeleteDialog(true)
  }

  async function confirmDelete() {
    if (!selectedSource) return
    try {
      // Use API route which uses admin client to bypass RLS
      const res = await fetch(`/api/import-sources/${selectedSource.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Error al eliminar")
      }
      toast({
        title: "Fuente eliminada",
        description: `La fuente "${selectedSource.name}" ha sido eliminada correctamente`,
      })
      await loadSources()
      setShowDeleteDialog(false)
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
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

      setBackgroundImports((prev) => {
        const cleaned = new Map(prev)
        for (const sourceId of cleaned.keys()) {
          if (!newRunningImports.has(sourceId)) {
            cleaned.delete(sourceId)
          }
        }
        return cleaned
      })
    } catch (error) {
      console.error("Error checking running imports:", error)
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
    setImportProgress((prev) => ({ ...prev, status: "cancelled" }))
    if (currentImportHistoryId) {
      supabase
        .from("import_history")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", currentImportHistoryId)
        .then(() => {})
    }
    toast({ title: "Importación cancelada", description: "La importación ha sido cancelada por el usuario" })
  }

  function closeProgressDialog() {
    setShowProgressDialog(false)
    setCurrentImportHistoryId(null)
  }

  const handleDiagnostic = async () => {
    setLoadingDiagnostic(true)
    try {
      const response = await fetch("/api/diagnose-products")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setDiagnosticData(data)
      setShowDiagnosticDialog(true)
    } catch (error: any) {
      toast({ title: "Error al diagnosticar", description: error.message, variant: "destructive" })
    } finally {
      setLoadingDiagnostic(false)
    }
  }

  const handleCleanDuplicates = async () => {
    if (!diagnosticData || diagnosticData.duplicateSKUs === 0) {
      toast({ title: "Sin duplicados", description: "No hay SKUs duplicados para limpiar" })
      return
    }
    const confirmClean = window.confirm(
      `¿Estás seguro de que deseas eliminar ${diagnosticData.duplicateSKUs} productos duplicados?\n\nEsta acción no se puede deshacer.`,
    )
    if (!confirmClean) return

    setCleaningDuplicates(true)
    try {
      const response = await fetch("/api/clean-duplicates", { method: "POST" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      toast({ title: "Limpieza completada", description: `Se eliminaron ${result.deleted} productos duplicados` })
      setShowDiagnosticDialog(false)
      await handleDiagnostic()
    } catch (error: any) {
      toast({ title: "Error al limpiar", description: error.message, variant: "destructive" })
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
        loadSources()
      } else {
        toast({
          title: "Sin tareas pendientes",
          description: data.message || "No hay importaciones programadas para ejecutar ahora",
        })
      }
    } catch (error: any) {
      toast({ title: "Error al ejecutar cron", description: error.message, variant: "destructive" })
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
      const response = await fetch("/api/reset-database", { method: "POST" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      toast({ title: "Base de datos reiniciada", description: `Se eliminaron ${result.deletedProducts} productos` })
      setShowResetDialog(false)
      setResetConfirmText("")
      await loadSources()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setResetLoading(false)
    }
  }

  const handleAnalyzeDuplicates = async () => {
    setIsAnalyzing(true)
    setAnalysisResult(null)
    try {
      const response = await fetch("/api/duplicates/find")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()

      if (data.error && data.instructions) {
        toast({
          title: "Configuración requerida",
          description: data.instructions,
          variant: "destructive",
          duration: 10000,
        })
        setAnalysisResult({ ...data, needsSQLSetup: true })
      } else if (data.method === "sample_analysis") {
        toast({ title: "Análisis completado (muestra)", description: `Análisis basado en muestra. ${data.note}` })
        setAnalysisResult(data)
      } else {
        toast({
          title: "Análisis completado",
          description: `Se encontraron ${data.totalDuplicateSKUs} SKUs duplicados en ${data.totalProducts} productos`,
        })
        setAnalysisResult(data)
      }
    } catch (error: any) {
      toast({ title: "Error al analizar", description: error.message, variant: "destructive" })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCleanDuplicatesAuto = async () => {
    if (!analysisResult || analysisResult.totalDuplicateSKUs === 0) {
      toast({ title: "Sin duplicados", description: "No hay productos duplicados para eliminar" })
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
    toast({ title: "Iniciando limpieza", description: "Eliminando productos duplicados..." })

    try {
      const response = await fetch("/api/duplicates/delete", { method: "POST" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()

      if (result.error && result.instructions) {
        toast({
          title: "Configuración requerida",
          description: result.instructions,
          variant: "destructive",
          duration: 10000,
        })
      } else if (result.success) {
        toast({
          title: "Limpieza completada exitosamente",
          description: `Se eliminaron ${result.deletedCount} productos duplicados.`,
        })
        setTimeout(() => {
          handleAnalyzeDuplicates()
        }, 1000)
      } else {
        toast({
          title: "Limpieza completada con advertencias",
          description: `Se eliminaron ${result.deletedCount || 0} productos duplicados.`,
        })
      }
    } catch (error: any) {
      toast({ title: "Error al limpiar", description: error.message, variant: "destructive" })
    } finally {
      setIsCleaning(false)
    }
  }

  useEffect(() => {
    loadSources()
    const interval = setInterval(checkRunningImports, 5000)
    const backgroundProgressInterval = setInterval(() => {
      if (backgroundImports.size === 0) return
      const updatedImports = new Map(backgroundImports)
      let hasUpdates = false
      for (const [sourceId] of backgroundImports.entries()) {
        if (sourceToImport?.id === sourceId) {
          if (
            importProgress.total > 0 ||
            importProgress.processed > 0 ||
            importProgress.imported > 0 ||
            importProgress.updated > 0
          ) {
            updatedImports.set(sourceId, { ...importProgress })
            hasUpdates = true
          }
        }
      }
      if (hasUpdates) setBackgroundImports(updatedImports)
    }, 2000)
    return () => {
      clearInterval(interval)
      clearInterval(backgroundProgressInterval)
    }
  }, [])

  useEffect(() => {
    if (
      sourceToImport?.id &&
      (importProgress.status === "running" ||
        importProgress.processed > 0 ||
        importProgress.imported > 0 ||
        importProgress.updated > 0)
    ) {
      setBackgroundImports((prev) => {
        const updated = new Map(prev)
        updated.set(sourceToImport.id, { ...importProgress })
        return updated
      })
    }
  }, [importProgress, sourceToImport?.id])

  return {
    // Data
    sources,
    loading,
    selectedSource,
    importing,
    runningImports,
    expandedSources,
    backgroundImports,
    importProgress,
    sourceToImport,
    showDeleteDialog,
    showProgressDialog,
    showDiagnosticDialog,
    showResetDialog,
    showScheduleDialog,
    schedulesTableExists,
    scheduleConfig,
    importMode,
    exportingConfig,
    restoringConfig,
    runningCron,
    loadingDiagnostic,
    diagnosticData,
    cleaningDuplicates,
    isAnalyzing,
    isCleaning,
    analysisResult,
    resetConfirmText,
    resetLoading,
    // Setters
    setShowDeleteDialog,
    setShowProgressDialog,
    setShowDiagnosticDialog,
    setShowResetDialog,
    setShowScheduleDialog,
    setScheduleConfig,
    setImportMode,
    setSourceToImport,
    setResetConfirmText,
    setBackgroundImports,
    setRunningImports,
    // Actions
    loadSources,
    handleExportConfig,
    handleRestoreConfig,
    handleRunImport,
    executeImport,
    handleDeleteSource,
    confirmDelete,
    toggleSourceExpand,
    cancelImport,
    closeProgressDialog,
    handleDiagnostic,
    handleCleanDuplicates,
    handleRunCron,
    handleResetDatabase,
    handleAnalyzeDuplicates,
    handleCleanDuplicatesAuto,
    router,
  }
}
