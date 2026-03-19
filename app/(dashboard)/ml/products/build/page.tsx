"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Play, Pause, AlertCircle, CheckCircle2 } from "lucide-react"

export default function ProductBuilderPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [progress, setProgress] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [autoMode, setAutoMode] = useState(false)

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (selectedAccountId) {
      fetchStats()
    }
  }, [selectedAccountId])

  // Auto-mode loop
  useEffect(() => {
    if (!autoMode || !selectedAccountId || running) return

    // Si ya completó, apagar auto-mode
    if (
      progress?.status === "done" ||
      (progress?.publications_processed >= progress?.publications_total && progress?.publications_total > 0)
    ) {
      setAutoMode(false)
      return
    }

    const interval = setInterval(() => {
      handleRun()
    }, 3000)

    return () => clearInterval(interval)
  }, [autoMode, selectedAccountId, running, progress])

  const fetchAccounts = async () => {
    const res = await fetch("/api/mercadolibre/accounts")
    const data = await res.json()
    setAccounts(data.accounts || [])
    if (data.accounts?.length > 0) {
      setSelectedAccountId(data.accounts[0].id)
    }
  }

  const fetchStats = async () => {
    const res = await fetch(`/api/ml/products/build/stats?account_id=${selectedAccountId}`)
    const data = await res.json()
    setProgress(data)
  }

  const handleRun = async () => {
    if (running) return

    setRunning(true)
    try {
      const res = await fetch("/api/ml/products/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          max_seconds: 10,
          batch_size: 100,
        }),
      })

      const data = await res.json()
      console.log("[PRODUCT-BUILDER] Run result:", data)

      await fetchStats()
    } catch (error) {
      console.error("[PRODUCT-BUILDER] Error:", error)
    } finally {
      setRunning(false)
    }
  }

  const handleStart = () => {
    setAutoMode(true)
    handleRun()
  }

  const handlePause = () => {
    setAutoMode(false)
  }

  const progressPercent =
    progress?.publications_total > 0
      ? Math.round((progress.publications_processed / progress.publications_total) * 100)
      : 0

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">Product Builder</h1>
      <p className="text-muted-foreground mb-6">
        Crea productos en tu catálogo desde las publicaciones importadas de MercadoLibre
      </p>

      {/* Explicación */}
      <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-2">¿Qué hace el Product Builder?</p>
            <p className="mb-2">
              Toma las publicaciones de MercadoLibre que ya fueron importadas y crea automáticamente productos en tu
              catálogo.
            </p>
            <ul className="text-xs space-y-1 ml-4 list-disc">
              <li>Si el producto ya existe (por SKU/ISBN/EAN), solo vincula la publicación</li>
              <li>Si no existe, crea un nuevo producto con los datos de ML</li>
              <li>El proceso es seguro y puede pausarse/reanudarse en cualquier momento</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Progreso */}
      {progress && (
        <Card className="p-5 mb-6">
          <h3 className="font-semibold mb-4">Progreso</h3>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Publicaciones procesadas</span>
              <span className="text-sm font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {progress.publications_processed?.toLocaleString() || 0} de{" "}
              {progress.publications_total?.toLocaleString() || 0}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-green-50 rounded-md border border-green-200">
              <div className="text-2xl font-bold text-green-700">{progress.products_created || 0}</div>
              <div className="text-xs text-green-600">Productos creados</div>
            </div>

            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <div className="text-2xl font-bold text-blue-700">{progress.products_updated || 0}</div>
              <div className="text-xs text-blue-600">Productos vinculados</div>
            </div>
          </div>

          {progress.status === "done" && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-800 font-medium">
                Proceso completado. Todos los productos fueron creados/vinculados.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Acciones */}
      <Card className="p-5 mb-6">
        <h3 className="font-semibold mb-4">Acciones</h3>

        {progress?.status !== "done" && (
          <div className="flex flex-wrap gap-3">
            {!autoMode && (
              <Button onClick={handleStart} disabled={running} size="lg">
                {running ? "Ejecutando..." : "Iniciar"}
                {!running && <Play className="ml-2 h-4 w-4" />}
              </Button>
            )}

            {autoMode && (
              <Button onClick={handlePause} size="lg" variant="outline" className="bg-transparent">
                <Pause className="mr-2 h-4 w-4" />
                Pausar
              </Button>
            )}
          </div>
        )}

        {progress?.status === "done" && (
          <p className="text-sm text-muted-foreground">
            El proceso ha finalizado. Todos los productos fueron procesados.
          </p>
        )}

        {autoMode && progress?.status !== "done" && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 font-medium mb-1">Modo automático activo</p>
            <p className="text-xs text-blue-600">
              El proceso continúa automáticamente cada 3 segundos. Podés pausar en cualquier momento.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}
