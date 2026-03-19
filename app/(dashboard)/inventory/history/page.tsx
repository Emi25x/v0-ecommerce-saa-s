"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Package, ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"

export default function ImportHistoryPage() {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [selectedImport, setSelectedImport] = useState<any>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const recordsPerPage = 50

  useEffect(() => {
    loadHistory()
  }, [currentPage])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/inventory/history?page=${currentPage}&limit=${recordsPerPage}`)

      if (response.ok) {
        const data = await response.json()
        setHistory(data.history || [])
        setTotalRecords(data.total || 0)
        setTotalPages(data.totalPages || 0)
      } else {
        const errorData = await response.json()
        toast({
          title: "Error",
          description: `No se pudo cargar el historial: ${errorData.error}`,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Error al cargar historial: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case "error":
        return <XCircle className="h-5 w-5 text-red-600" />
      case "partial":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />
      case "running":
        return <Clock className="h-5 w-5 text-blue-600 animate-spin" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-600">Exitosa</Badge>
      case "error":
        return <Badge variant="destructive">Error</Badge>
      case "partial":
        return <Badge className="bg-yellow-600">Parcial</Badge>
      case "running":
        return <Badge className="bg-blue-600">En Progreso</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const formatDuration = (startedAt: string, completedAt: string | null) => {
    if (!completedAt) return "En progreso..."
    const start = new Date(startedAt).getTime()
    const end = new Date(completedAt).getTime()
    const durationSeconds = Math.round((end - start) / 1000)

    if (durationSeconds < 60) return `${durationSeconds}s`
    const minutes = Math.floor(durationSeconds / 60)
    const seconds = durationSeconds % 60
    return `${minutes}m ${seconds}s`
  }

  const handleViewDetails = (importRecord: any) => {
    setSelectedImport(importRecord)
    setShowDetailsDialog(true)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Ecommerce Manager</h1>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-64 border-r border-border bg-sidebar">
          <nav className="flex flex-col gap-1 p-4">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Package className="h-5 w-5" />
              <span className="font-medium">Dashboard</span>
            </Link>
            <a
              href="/inventory"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Package className="h-5 w-5" />
              <span className="font-medium">Base de Productos</span>
            </a>
            <a
              href="/inventory/history"
              className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2 text-sidebar-accent-foreground transition-colors"
            >
              <Clock className="h-5 w-5" />
              <span className="font-medium">Historial de Importaciones</span>
            </a>
            <a
              href="/import-sources"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Package className="h-5 w-5" />
              <span className="font-medium">Fuentes de Importación</span>
            </a>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Historial de Importaciones</h2>
                <p className="text-muted-foreground">Registro completo de todas las importaciones realizadas</p>
              </div>
              <Button onClick={loadHistory} variant="outline">
                Actualizar
              </Button>
            </div>

            <div className="rounded-lg border-2 border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="border-r-2 border-border w-12">Estado</TableHead>
                    <TableHead className="border-r-2 border-border">Fuente</TableHead>
                    <TableHead className="border-r-2 border-border">Fecha/Hora Inicio</TableHead>
                    <TableHead className="border-r-2 border-border">Duración</TableHead>
                    <TableHead className="border-r-2 border-border text-center">Nuevos</TableHead>
                    <TableHead className="border-r-2 border-border text-center">Saltados</TableHead>
                    <TableHead className="border-r-2 border-border text-center">Errores</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Cargando historial...
                      </TableCell>
                    </TableRow>
                  ) : history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        No hay importaciones registradas
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="border-r-2 border-border">
                          <div className="flex items-center justify-center">{getStatusIcon(record.status)}</div>
                        </TableCell>
                        <TableCell className="border-r-2 border-border">
                          <div>
                            <div className="font-medium">{record.import_sources?.name || "Fuente desconocida"}</div>
                            {record.import_sources?.description && (
                              <div className="text-xs text-muted-foreground">{record.import_sources.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="border-r-2 border-border">
                          <div className="text-sm">{new Date(record.started_at).toLocaleString()}</div>
                        </TableCell>
                        <TableCell className="border-r-2 border-border">
                          <div className="text-sm font-mono">
                            {formatDuration(record.started_at, record.completed_at)}
                          </div>
                        </TableCell>
                        <TableCell className="border-r-2 border-border text-center">
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          >
                            {record.products_imported || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="border-r-2 border-border text-center">
                          <Badge
                            variant="secondary"
                            className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                          >
                            {record.products_updated || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="border-r-2 border-border text-center">
                          {(record.products_failed || 0) > 0 ? (
                            <Badge
                              variant="secondary"
                              className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            >
                              {record.products_failed}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleViewDetails(record)}>
                            Ver Detalles
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * recordsPerPage + 1} a{" "}
                {Math.min(currentPage * recordsPerPage, totalRecords)} de {totalRecords} registros
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <div className="text-sm">
                  Página {currentPage} de {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Details Dialog */}
          <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Detalles de la Importación</DialogTitle>
                <DialogDescription>Información completa de la importación seleccionada</DialogDescription>
              </DialogHeader>
              {selectedImport && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Fuente</div>
                      <div className="font-medium">{selectedImport.import_sources?.name || "Desconocida"}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Estado</div>
                      <div>{getStatusBadge(selectedImport.status)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Fecha/Hora Inicio</div>
                      <div className="text-sm">{new Date(selectedImport.started_at).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Fecha/Hora Fin</div>
                      <div className="text-sm">
                        {selectedImport.completed_at
                          ? new Date(selectedImport.completed_at).toLocaleString()
                          : "En progreso..."}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Duración</div>
                    <div className="font-mono">
                      {formatDuration(selectedImport.started_at, selectedImport.completed_at)}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Resumen de Resultados</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <div className="text-sm text-green-600 dark:text-green-400 font-medium">Productos Nuevos</div>
                        <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                          {selectedImport.products_imported || 0}
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-950/30 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Saltados</div>
                        <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">
                          {selectedImport.products_updated || 0}
                        </div>
                      </div>
                      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="text-sm text-red-600 dark:text-red-400 font-medium">Errores</div>
                        <div className="text-3xl font-bold text-red-700 dark:text-red-300">
                          {selectedImport.products_failed || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedImport.error_message && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-2 text-red-600 dark:text-red-400">Mensaje de Error</h3>
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-3">
                        <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                          {selectedImport.error_message}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setShowDetailsDialog(false)}>Cerrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  )
}
