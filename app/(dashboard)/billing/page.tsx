"use client"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Receipt, Settings, HelpCircle } from "lucide-react"
import { useBilling } from "@/hooks/use-billing"
import { BillingStats } from "@/components/billing/BillingStats"
import { EmpresaSelector } from "@/components/billing/EmpresaSelector"
import { InvoiceTable } from "@/components/billing/InvoiceTable"
import { ConfigTab } from "@/components/billing/ConfigTab"
import { HelpTab } from "@/components/billing/HelpTab"
import { NewInvoiceDialog } from "@/components/billing/NewInvoiceDialog"

export default function BillingPage() {
  const billing = useBilling()

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Facturaci&oacute;n Electr&oacute;nica</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emisi&oacute;n de comprobantes electr&oacute;nicos via ARCA (ex-AFIP) &mdash; Webservice WSFE v1
          </p>
        </div>
        <Button onClick={billing.openNewInvoice} className="gap-2" size="sm">
          <Plus className="h-4 w-4" />
          Nueva factura
        </Button>
      </div>

      {/* Selector de empresa */}
      <EmpresaSelector
        empresas={billing.empresas}
        empresaActivaId={billing.empresaActivaId}
        loadingConfig={billing.loadingConfig}
        switchEmpresa={billing.switchEmpresa}
        cloneEmpresa={billing.cloneEmpresa}
        setConfigForm={billing.setConfigForm}
        setCloningFrom={billing.setCloningFrom}
        setActiveTab={billing.setActiveTab}
      />

      {/* Stats empresa activa */}
      <BillingStats total={billing.total} config={billing.config} />

      {/* Tabs */}
      <Tabs value={billing.activeTab} onValueChange={billing.setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="facturas" className="gap-2">
            <Receipt className="h-4 w-4" />
            Facturas
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuraci&oacute;n ARCA
          </TabsTrigger>
          <TabsTrigger value="ayuda" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            C&oacute;mo tramitar el certificado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facturas">
          <InvoiceTable
            config={billing.config}
            facturas={billing.facturas}
            loadingF={billing.loadingF}
            searchQ={billing.searchQ}
            setSearchQ={billing.setSearchQ}
            filterEstado={billing.filterEstado}
            setFilterEstado={billing.setFilterEstado}
            page={billing.page}
            setPage={billing.setPage}
            totalPages={billing.totalPages}
            total={billing.total}
            loadFacturas={billing.loadFacturas}
            refetchingId={billing.refetchingId}
            refetchBilling={billing.refetchBilling}
            setActiveTab={billing.setActiveTab}
          />
        </TabsContent>

        <TabsContent value="config">
          <ConfigTab
            empresas={billing.empresas}
            empresaActivaId={billing.empresaActivaId}
            setEmpresaActivaId={billing.setEmpresaActivaId}
            populateForm={billing.populateForm}
            configForm={billing.configForm}
            setConfigForm={billing.setConfigForm}
            cloningFrom={billing.cloningFrom}
            setCloningFrom={billing.setCloningFrom}
            confirmDelete={billing.confirmDelete}
            setConfirmDelete={billing.setConfirmDelete}
            deletingEmpresa={billing.deletingEmpresa}
            deleteEmpresa={billing.deleteEmpresa}
            savingConfig={billing.savingConfig}
            saveConfig={billing.saveConfig}
            configMsg={billing.configMsg}
            uploadingLogo={billing.uploadingLogo}
            uploadLogo={billing.uploadLogo}
          />
        </TabsContent>

        <TabsContent value="ayuda">
          <HelpTab />
        </TabsContent>
      </Tabs>

      {/* Modal nueva factura */}
      <NewInvoiceDialog
        open={billing.showNew}
        onOpenChange={billing.onNewDialogOpenChange}
        newForm={billing.newForm}
        setNewForm={billing.setNewForm}
        items={billing.items}
        addItem={billing.addItem}
        removeItem={billing.removeItem}
        updateItem={billing.updateItem}
        totales={billing.totales}
        skuInput={billing.skuInput}
        setSkuInput={billing.setSkuInput}
        skuStatus={billing.skuStatus}
        setSkuStatus={billing.setSkuStatus}
        lookupProduct={billing.lookupProduct}
        padronStatus={billing.padronStatus}
        padronMsg={billing.padronMsg}
        lookupPadron={billing.lookupPadron}
        setPadronStatus={billing.setPadronStatus}
        setPadronMsg={billing.setPadronMsg}
        emitting={billing.emitting}
        emitError={billing.emitError}
        emitirFactura={billing.emitirFactura}
      />
    </div>
  )
}
