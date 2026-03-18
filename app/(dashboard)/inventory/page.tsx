"use client"

import { Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Search, Upload, Activity, Settings } from "lucide-react"
import Link from "next/link"
import { useInventory } from "@/hooks/use-inventory"
import {
  InventorySidebar,
  ProductTable,
  ProductFilters,
  Pagination,
  ImportDialog,
  ImportProgressDialog,
  ImportSummaryDialog,
  ValidationDialog,
  EditProductDialog,
  DeleteProductDialog,
  ProductDetailsDialog,
  DiagnosticsDialog,
  SkuVerifierDialog,
} from "@/components/inventory"

export default function InventoryPage() {
  const inv = useInventory()

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
        <InventorySidebar />

        <main className="flex-1 p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Base de Productos</h2>
                <p className="text-muted-foreground">Gestiona tu inventario de productos</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="lg" onClick={() => inv.setShowSkuVerifier(true)} className="gap-2">
                  <Search className="h-5 w-5" />
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">Verificar SKU</span>
                    <span className="text-xs text-muted-foreground">Buscar en base de datos</span>
                  </div>
                </Button>
                <Link href="/inventory/sources">
                  <Button variant="outline" size="lg" className="gap-2 bg-transparent">
                    <Settings className="h-5 w-5" />
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Gestor de Importaciones</span>
                      <span className="text-xs text-muted-foreground">Ver fuentes configuradas</span>
                    </div>
                  </Button>
                </Link>
                <Button variant="outline" onClick={inv.handleOpenDiagnostics}>
                  <Activity className="mr-2 h-4 w-4" />
                  Diagn&oacute;stico
                </Button>
                <Button onClick={() => inv.setShowImportDialog(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar desde Fuente
                </Button>
              </div>
            </div>

            {inv.errorMessage && (
              <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-600 dark:text-red-400 font-medium">{inv.errorMessage}</p>
              </div>
            )}

            <ProductFilters
              searchQuery={inv.searchQuery}
              debouncedSearch={inv.debouncedSearch}
              onSearchChange={inv.setSearchQuery}
              onRefresh={inv.loadProducts}
            />

            <ProductTable
              products={inv.products}
              loading={inv.loading}
              searchQuery={inv.searchQuery}
              selectedProducts={inv.selectedProducts}
              sortBy={inv.sortBy}
              sortOrder={inv.sortOrder}
              onSort={inv.handleSort}
              onToggleSelectAll={inv.toggleSelectAll}
              onToggleSelectProduct={inv.toggleSelectProduct}
              onEditProduct={inv.handleEditProduct}
              onViewDetails={inv.handleViewDetails}
              onDeleteProduct={inv.confirmDelete}
            />

            <Pagination
              currentPage={inv.currentPage}
              totalPages={inv.totalPages}
              totalProducts={inv.totalProducts}
              searchQuery={inv.searchQuery}
              onPageChange={inv.setCurrentPage}
            />
          </div>

          <ImportDialog
            open={inv.showImportDialog}
            onOpenChange={inv.setShowImportDialog}
            importSources={inv.importSources}
            selectedSource={inv.selectedSource}
            onSelectedSourceChange={inv.setSelectedSource}
            scheduleFrequency={inv.scheduleFrequency}
            onScheduleFrequencyChange={inv.setScheduleFrequency}
            scheduleTimezone={inv.scheduleTimezone}
            onScheduleTimezoneChange={inv.setScheduleTimezone}
            scheduleTime={inv.scheduleTime}
            onScheduleTimeChange={inv.setScheduleTime}
            scheduleDayOfWeek={inv.scheduleDayOfWeek}
            onScheduleDayOfWeekChange={inv.setScheduleDayOfWeek}
            scheduleDayOfMonth={inv.scheduleDayOfMonth}
            onScheduleDayOfMonthChange={inv.setScheduleDayOfMonth}
            onImport={inv.handleImportFromSource}
          />

          <ValidationDialog
            open={inv.showValidationDialog}
            onOpenChange={inv.setShowValidationDialog}
            validating={inv.validating}
            validationResults={inv.validationResults}
          />

          <ImportProgressDialog importProgress={inv.importProgress} />

          <ImportSummaryDialog
            open={inv.showImportSummary}
            onOpenChange={inv.setShowImportSummary}
            importSummary={inv.importSummary}
            onSearchSku={(sku) => {
              inv.setSearchQuery(sku)
              inv.setShowImportSummary(false)
              inv.loadProducts()
            }}
          />

          <EditProductDialog
            open={inv.showEditDialog}
            onOpenChange={inv.setShowEditDialog}
            editingProduct={inv.editingProduct}
            onEditingProductChange={inv.setEditingProduct}
            onSave={inv.handleSaveEdit}
          />

          <DeleteProductDialog
            open={inv.showDeleteDialog}
            onOpenChange={inv.setShowDeleteDialog}
            deletingProduct={inv.deletingProduct}
            onDelete={inv.handleDeleteProduct}
            onCancel={() => {
              inv.setShowDeleteDialog(false)
              inv.setDeletingProduct(null)
            }}
          />

          <ProductDetailsDialog
            open={inv.showDetailsDialog}
            onOpenChange={inv.setShowDetailsDialog}
            product={inv.detailsProduct}
          />

          <DiagnosticsDialog
            open={inv.showDiagnostics}
            onOpenChange={inv.setShowDiagnostics}
            loading={inv.loadingDiagnostics}
            diagnosticsData={inv.diagnosticsData}
          />

          <SkuVerifierDialog
            open={inv.showSkuVerifier}
            onOpenChange={inv.setShowSkuVerifier}
            skuToVerify={inv.skuToVerify}
            onSkuChange={inv.setSkuToVerify}
            verificationResult={inv.verificationResult}
            verifying={inv.verifying}
            onVerify={inv.handleVerifySku}
            onViewProduct={(sku) => {
              inv.setSearchQuery(sku)
              inv.setShowSkuVerifier(false)
              inv.loadProducts()
            }}
          />
        </main>
      </div>
    </div>
  )
}
