"use client"

import { useOrders } from "@/hooks/use-orders"
import { OrderFilters } from "@/components/orders/OrderFilters"
import { OrdersTable } from "@/components/orders/OrdersTable"
import { OrderDialogs } from "@/components/orders/OrderDialogs"

export default function OrdersPage() {
  const hook = useOrders()

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-1">
          <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
            <div className="mx-auto grid w-full flex-1 auto-rows-max gap-4">
              <OrderFilters
                orders={hook.orders}
                totalOrders={hook.totalOrders}
                loading={hook.loading}
                mlAccounts={hook.mlAccounts}
                selectedAccount={hook.selectedAccount}
                setSelectedAccount={hook.setSelectedAccount}
                filters={hook.filters}
                setFilters={hook.setFilters}
                advancedFiltersOpen={hook.advancedFiltersOpen}
                setAdvancedFiltersOpen={hook.setAdvancedFiltersOpen}
                searchQuery={hook.searchQuery}
                setSearchQuery={hook.setSearchQuery}
                lastUpdated={hook.lastUpdated}
                fetchOrders={hook.fetchOrders}
                generalStatusCounts={hook.generalStatusCounts}
                availabilityCounts={hook.availabilityCounts}
              />

              <OrdersTable
                loading={hook.loading}
                filteredOrders={hook.filteredOrders}
                paginatedOrders={hook.paginatedOrders}
                searchQuery={hook.searchQuery}
                setSearchQuery={hook.setSearchQuery}
                visibleColumns={hook.visibleColumns}
                setVisibleColumns={hook.setVisibleColumns}
                sortConfig={hook.sortConfig}
                handleSortChange={hook.handleSortChange}
                selectedOrders={hook.selectedOrders}
                toggleSelectAll={hook.toggleSelectAll}
                toggleOrderSelection={hook.toggleOrderSelection}
                copiedOrderId={hook.copiedOrderId}
                copyOrderId={hook.copyOrderId}
                copiedSku={hook.copiedSku}
                copySku={hook.copySku}
                loadingSkus={hook.loadingSkus}
                markingReceived={hook.markingReceived}
                showMarkReceivedConfirmation={hook.showMarkReceivedConfirmation}
                viewOrderDetails={hook.viewOrderDetails}
                openMLOrder={hook.openMLOrder}
                fetchReturnDetails={hook.fetchReturnDetails}
                setSelectedReturnOrder={hook.setSelectedReturnOrder}
                setShowReturnDialog={hook.setShowReturnDialog}
                fetchOrdersEffect={hook.fetchOrdersEffect}
                currentPage={hook.currentPage}
                setCurrentPage={hook.setCurrentPage}
                totalPages={hook.totalPages}
                paging={hook.paging}
                totalOrders={hook.totalOrders}
                timeFilteredOrders={hook.timeFilteredOrders}
                filters={hook.filters}
              />
            </div>
          </main>
        </div>
      </div>

      <OrderDialogs
        showOrderDetails={hook.showOrderDetails}
        setShowOrderDetails={hook.setShowOrderDetails}
        selectedOrder={hook.selectedOrder}
        mlBrowserModal={hook.mlBrowserModal}
        setMlBrowserModal={hook.setMlBrowserModal}
        copyToClipboard={hook.copyToClipboard}
        returnDetailsOpen={hook.returnDetailsOpen}
        setReturnDetailsOpen={hook.setReturnDetailsOpen}
        returnDetails={hook.returnDetails}
        loadingReturnDetails={hook.loadingReturnDetails}
        showReturnDialog={hook.showReturnDialog}
        setShowReturnDialog={hook.setShowReturnDialog}
        selectedReturnOrder={hook.selectedReturnOrder}
        fetchReturnDetails={hook.fetchReturnDetails}
        showDeliveryConfirmDialog={hook.showDeliveryConfirmDialog}
        setShowDeliveryConfirmDialog={hook.setShowDeliveryConfirmDialog}
        isMarkingDelivered={hook.isMarkingDelivered}
        handleMarkAsDelivered={hook.handleMarkAsDelivered}
        confirmMarkReceived={hook.confirmMarkReceived}
        setConfirmMarkReceived={hook.setConfirmMarkReceived}
        confirmAndMarkReceived={hook.confirmAndMarkReceived}
      />
    </div>
  )
}
