"use client"

export const dynamic = "force-dynamic"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Database, Download, FileText, Loader2, Play, RefreshCw, RotateCcw, Trash2, Upload } from "lucide-react"
import Link from "next/link"
import { useImportSources } from "@/hooks/use-import-sources"
import {
  SourceCard,
  DeleteSourceDialog,
  ImportProgressDialog,
  DiagnosticDialog,
  ResetDatabaseDialog,
} from "@/components/inventory/sources"
import { toast } from "@/hooks/use-toast"

export default function SourcesPage() {
  const s = useImportSources()

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Importaciones</h1>
          <p className="text-muted-foreground">Administra tus fuentes de datos y configuraciones de importación</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={s.handleExportConfig} disabled={s.exportingConfig}>
            {s.exportingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar config
          </Button>
          <Button variant="outline" size="sm" onClick={s.handleRestoreConfig} disabled={s.restoringConfig}>
            {s.restoringConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Restaurar config
          </Button>
          <Button variant="outline" size="sm" onClick={s.handleRunCron} disabled={s.runningCron}>
            {s.runningCron ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Ejecutar Cron
          </Button>
          <Button variant="outline" size="sm" onClick={() => s.setShowDiagnosticDialog(true)} disabled={s.loadingDiagnostic}>
            {s.loadingDiagnostic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Diagnóstico
          </Button>
          <Button variant="destructive" size="sm" onClick={() => s.setShowResetDialog(true)}>
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

      {s.loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : s.sources.length === 0 ? (
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
          {s.sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              isExpanded={s.expandedSources.has(source.id)}
              isRunning={s.runningImports.has(source.id)}
              isImporting={s.importing === source.id}
              backgroundProgress={s.backgroundImports.get(source.id)}
              sourceToImportId={s.sourceToImport?.id}
              onToggleExpand={s.toggleSourceExpand}
              onRunImport={s.handleRunImport}
              onRunImportPro={(source) => {
                const encodedName = encodeURIComponent(source.name)
                const defaultMode = source.feed_type === "catalog" ? "upsert" : "update"
                s.router.push(`/inventory/sources/import-pro?sourceId=${source.id}&name=${encodedName}&mode=${defaultMode}`)
              }}
              onDelete={s.handleDeleteSource}
              onCancelImport={s.cancelImport}
              onCancelBackgroundImport={(source) => {
                s.setBackgroundImports((prev) => {
                  const updated = new Map(prev)
                  const current = updated.get(source.id)
                  if (current) {
                    updated.set(source.id, { ...current, status: "cancelled" })
                  }
                  return updated
                })
                s.setRunningImports((prev) => {
                  const updated = new Map(prev)
                  updated.delete(source.id)
                  return updated
                })
                toast({
                  title: "Importación cancelada",
                  description: `La importación de ${source.name} ha sido cancelada`,
                })
              }}
            />
          ))}
        </div>
      )}

      <DeleteSourceDialog
        open={s.showDeleteDialog}
        onOpenChange={s.setShowDeleteDialog}
        source={s.selectedSource}
        onConfirm={s.confirmDelete}
      />

      <ImportProgressDialog
        open={s.showProgressDialog}
        onClose={s.closeProgressDialog}
        importProgress={s.importProgress}
        onCancel={s.cancelImport}
      />

      <DiagnosticDialog
        open={s.showDiagnosticDialog}
        onOpenChange={s.setShowDiagnosticDialog}
        isAnalyzing={s.isAnalyzing}
        isCleaning={s.isCleaning}
        analysisResult={s.analysisResult}
        onAnalyze={s.handleAnalyzeDuplicates}
        onClean={s.handleCleanDuplicatesAuto}
      />

      <ResetDatabaseDialog
        open={s.showResetDialog}
        onOpenChange={s.setShowResetDialog}
        confirmText={s.resetConfirmText}
        onConfirmTextChange={s.setResetConfirmText}
        loading={s.resetLoading}
        onReset={s.handleResetDatabase}
      />
    </div>
  )
}
