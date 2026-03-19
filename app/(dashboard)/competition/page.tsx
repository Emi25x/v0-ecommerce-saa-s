"use client"

import { useCompetition } from "@/hooks/use-competition"
import { CompetitionFilters } from "@/components/competition/competition-filters"
import { CompetitionTable } from "@/components/competition/competition-table"
import { EditProductModal, RepricingModal } from "@/components/competition/competition-modals"

export default function CompetitionPage() {
  const {
    // State
    loading,
    analyzingId,
    searchQuery,
    setSearchQuery,
    mlPaging,
    currentPage,
    setCurrentPage,
    mlAccounts,
    selectedAccount,
    setSelectedAccount,
    expandedRows,
    applyingBoost,
    priceUpdateValue,
    setPriceUpdateValue,
    sortBy,
    setSortBy,
    filters,
    setFilters,
    editingProduct,
    setEditingProduct,
    editForm,
    setEditForm,
    selectedProducts,
    bulkUpdating,
    priceTrackings,
    showTrackingModal,
    setShowTrackingModal,
    trackingProduct,
    trackingForm,
    setTrackingForm,

    // Computed
    filteredProducts,
    totalPages,

    // Actions
    loadProducts,
    analyzeCompetition,
    analyzeAllVisible,
    toggleRowExpansion,
    toggleSelectAll,
    toggleSelectProduct,
    bulkUpdateToPriceToWin,
    applyPriceChange,
    applyShippingBoost,
    openEditModal,
    saveProductChanges,
    openTrackingModal,
    saveTrackingConfig,
  } = useCompetition()

  return (
    <div className="min-h-screen p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Análisis de Competencia</h2>
        <p className="text-muted-foreground">
          {mlPaging.total > 0
            ? `Total: ${mlPaging.total.toLocaleString()} publicaciones de catálogo`
            : "Analiza tu competencia en MercadoLibre"}
        </p>
      </div>

      <CompetitionFilters
        mlAccounts={mlAccounts}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        filters={filters}
        setFilters={setFilters}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />

      <CompetitionTable
        loading={loading}
        filteredProducts={filteredProducts}
        mlPaging={mlPaging}
        totalPages={totalPages}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        selectedProducts={selectedProducts}
        bulkUpdating={bulkUpdating}
        analyzingId={analyzingId}
        expandedRows={expandedRows}
        applyingBoost={applyingBoost}
        priceUpdateValue={priceUpdateValue}
        setPriceUpdateValue={setPriceUpdateValue}
        priceTrackings={priceTrackings}
        loadProducts={loadProducts}
        analyzeCompetition={analyzeCompetition}
        analyzeAllVisible={analyzeAllVisible}
        toggleRowExpansion={toggleRowExpansion}
        toggleSelectAll={toggleSelectAll}
        toggleSelectProduct={toggleSelectProduct}
        bulkUpdateToPriceToWin={bulkUpdateToPriceToWin}
        applyPriceChange={applyPriceChange}
        applyShippingBoost={applyShippingBoost}
        openEditModal={openEditModal}
        openTrackingModal={openTrackingModal}
      />

      {editingProduct && (
        <EditProductModal
          editingProduct={editingProduct}
          editForm={editForm}
          setEditForm={setEditForm}
          saveProductChanges={saveProductChanges}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {showTrackingModal && trackingProduct && (
        <RepricingModal
          trackingProduct={trackingProduct}
          trackingForm={trackingForm}
          setTrackingForm={setTrackingForm}
          priceTrackings={priceTrackings}
          saveTrackingConfig={saveTrackingConfig}
          onClose={() => setShowTrackingModal(false)}
        />
      )}
    </div>
  )
}
