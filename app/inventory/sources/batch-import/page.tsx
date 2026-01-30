"use client"

import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

export default function BatchImportPage() {
  const searchParams = useSearchParams()
  const [isRunning, setIsRunning] = useState(false)
  const [sourceId, setSourceId] = useState<string>("0477aa50-1c71-40b2-9530-9c794eb32793") // Default Arnoia
  const [sourceName, setSourceName] = useState<string>("Arnoia")
  const [importMode, setImportMode] = useState<string>("update")
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [updated, setUpdated] = useState(0)
  const [created, setCreated] = useState(0)
  const [status, setStatus] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])
  const abortRef = useRef(false)

  const addLog = (message: string) => {
    setLogs((prev) => [...prev.slice(-50), `${new Date().toLocaleTimeString()} - ${message}`])
  }

  // Leer parámetros de URL al cargar
  useEffect(() => {
    const urlSourceId = searchParams.get("sourceId")
    const urlMode = searchParams.get("mode")
    
    console.log("[v0] URL params - sourceId:", urlSourceId, "mode:", urlMode)
    
    if (urlSourceId) {
      console.log("[v0] Setting sourceId to:", urlSourceId)
      setSourceId(urlSourceId)
      // Cargar nombre de la fuente
      fetch(`/api/import-sources/${urlSourceId}`)
        .then(res => res.json())
        .then(data => {
          console.log("[v0] Source data loaded:", data)
          if (data.name) setSourceName(data.name)
        })
        .catch((err) => console.log("[v0] Error loading source:", err))
    }
    
    if (urlMode && ["update", "create", "upsert"].includes(urlMode)) {
      setImportMode(urlMode)
    }
  }, [searchParams])

  const startBatchImport = async () => {
    console.log("[v0] Starting batch import with sourceId:", sourceId, "mode:", importMode)
    
    setIsRunning(true)
    setProgress(0)
    setTotal(0)
    setProcessed(0)
    setUpdated(0)
    setCreated(0)
    setLogs([])
    abortRef.current = false

    let offset = 0
    let totalUpdated = 0
    let totalCreated = 0
    let done = false

    addLog(`Iniciando importacion por lotes de ${sourceName}...`)

    while (!done && !abortRef.current) {
      try {
        setStatus(`Procesando lote desde posicion ${offset}...`)
        addLog(`Procesando lote desde offset ${offset}`)

        const response = await fetch("/api/inventory/import/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId, offset, mode: importMode }),
        })

        if (!response.ok) {
          const error = await response.json()
          addLog(`Error: ${error.error}`)
          setStatus(`Error: ${error.error}`)
          break
        }

        const result = await response.json()

        setTotal(result.total)
        setProcessed(result.processed)
        setProgress(result.progress || 0)
        totalUpdated += result.updated || 0
        totalCreated += result.created || 0
        setUpdated(totalUpdated)
        setCreated(totalCreated)

        addLog(`Lote completado: ${result.created || 0} creados, ${result.updated || 0} actualizados, progreso ${result.progress}%`)

        if (result.done) {
          done = true
          setStatus("Importacion completada")
          addLog(`Importacion completada. Creados: ${totalCreated}, Actualizados: ${totalUpdated}`)
        } else {
          offset = result.nextOffset
          // Pequeña pausa entre lotes
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } catch (error) {
        addLog(`Error de conexion: ${error}`)
        setStatus("Error de conexion")
        break
      }
    }

    if (abortRef.current) {
      setStatus("Importacion cancelada")
      addLog("Importacion cancelada por el usuario")
    }

    setIsRunning(false)
  }

  const stopImport = () => {
    abortRef.current = true
    setStatus("Cancelando...")
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
<CardTitle>Importacion por Lotes - {sourceName}</CardTitle>
  <CardDescription>
  Importa productos procesando en lotes. Mantené esta página abierta durante el proceso.
            El proceso puede tardar varios minutos pero no se interrumpira si cambias de pagina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Selector de modo de importación */}
          <div className="space-y-2">
            <Label htmlFor="import-mode">Modo de importacion</Label>
            <Select value={importMode} onValueChange={setImportMode} disabled={isRunning}>
              <SelectTrigger id="import-mode" className="w-full max-w-xs">
                <SelectValue placeholder="Seleccionar modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="update">Solo actualizar existentes</SelectItem>
                <SelectItem value="create">Solo crear nuevos</SelectItem>
                <SelectItem value="upsert">Crear y actualizar</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {importMode === "update" && "Solo actualiza productos que ya existen en tu base de datos (por EAN)"}
              {importMode === "create" && "Solo crea productos nuevos (por EAN), no modifica los existentes"}
              {importMode === "upsert" && "Crea productos nuevos y actualiza los existentes (por EAN)"}
            </p>
          </div>

          <div className="flex gap-4">
            <Button onClick={startBatchImport} disabled={isRunning}>
              {isRunning ? "Ejecutando..." : "Iniciar Importacion"}
            </Button>
            {isRunning && (
              <Button variant="destructive" onClick={stopImport}>
                Cancelar
              </Button>
            )}
          </div>

          {(isRunning || processed > 0) && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Progreso: {progress}%</span>
                <span>
                  {processed.toLocaleString()} / {total.toLocaleString()} filas
                </span>
              </div>
              <Progress value={progress} />
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Creados</div>
                  <div className="text-2xl font-bold text-blue-600">{created.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Actualizados</div>
                  <div className="text-2xl font-bold text-green-600">{updated.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Estado</div>
                  <div className="text-sm">{status}</div>
                </div>
              </div>
            </div>
          )}

          {logs.length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium mb-2">Logs</h3>
              <div className="bg-black text-green-400 p-4 rounded font-mono text-xs max-h-64 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
