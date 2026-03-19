"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Plus, RefreshCw, Receipt, CheckCircle2, XCircle, Trash2, Barcode, Loader2, X, ShieldCheck } from "lucide-react"
import { CONDICION_IVA_OPTS, TIPO_DOC_OPTS, IVA_OPTS, calcItem } from "./types"
import type { FacturaItem, NewFormState } from "./types"

interface NewInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Form
  newForm: NewFormState
  setNewForm: (fn: NewFormState | ((prev: NewFormState) => NewFormState)) => void
  // Items
  items: Partial<FacturaItem>[]
  addItem: () => void
  removeItem: (idx: number) => void
  updateItem: (idx: number, field: keyof FacturaItem, value: any) => void
  totales: { subtotal: number; iva: number; total: number }
  // SKU lookup
  skuInput: string[]
  setSkuInput: (fn: string[] | ((prev: string[]) => string[])) => void
  skuStatus: ("idle" | "loading" | "found" | "notfound")[]
  setSkuStatus: (
    fn:
      | ("idle" | "loading" | "found" | "notfound")[]
      | ((prev: ("idle" | "loading" | "found" | "notfound")[]) => ("idle" | "loading" | "found" | "notfound")[]),
  ) => void
  lookupProduct: (idx: number, query: string) => void
  // Padron
  padronStatus: "idle" | "loading" | "found" | "error"
  padronMsg: string
  lookupPadron: (doc: string, tipo: string) => void
  setPadronStatus: (s: "idle" | "loading" | "found" | "error") => void
  setPadronMsg: (s: string) => void
  // Emit
  emitting: boolean
  emitError: string | null
  emitirFactura: () => void
}

export function NewInvoiceDialog({
  open,
  onOpenChange,
  newForm,
  setNewForm,
  items,
  addItem,
  removeItem,
  updateItem,
  totales,
  skuInput,
  setSkuInput,
  skuStatus,
  setSkuStatus,
  lookupProduct,
  padronStatus,
  padronMsg,
  lookupPadron,
  setPadronStatus,
  setPadronMsg,
  emitting,
  emitError,
  emitirFactura,
}: NewInvoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Nueva factura electr&oacute;nica
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Tipo comprobante */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de comprobante</Label>
              <Select
                value={newForm.tipo_comprobante}
                onValueChange={(v) => setNewForm((p) => ({ ...p, tipo_comprobante: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">Factura B</SelectItem>
                  <SelectItem value="11">Factura C</SelectItem>
                  <SelectItem value="1">Factura A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Concepto</Label>
              <Select value={newForm.concepto} onValueChange={(v) => setNewForm((p) => ({ ...p, concepto: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Productos</SelectItem>
                  <SelectItem value="2">Servicios</SelectItem>
                  <SelectItem value="3">Productos y Servicios</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Receptor */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <h4 className="font-medium text-sm">Datos del receptor</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre / Raz&oacute;n social</Label>
                <Input
                  placeholder="Juan Garc&iacute;a"
                  value={newForm.receptor_nombre}
                  onChange={(e) => setNewForm((p) => ({ ...p, receptor_nombre: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo documento</Label>
                <Select
                  value={newForm.tipo_doc_receptor}
                  onValueChange={(v) =>
                    setNewForm((p) => ({
                      ...p,
                      tipo_doc_receptor: v,
                      nro_doc_receptor: v === "99" ? "" : p.nro_doc_receptor,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_DOC_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  N&deg; documento
                  {newForm.tipo_doc_receptor === "99" ? (
                    <span className="text-muted-foreground font-normal ml-1">(no requerido)</span>
                  ) : (
                    <span className="text-muted-foreground font-normal ml-1 text-xs">
                      {"\u2014"} Enter para buscar en padr&oacute;n ARCA
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    placeholder={newForm.tipo_doc_receptor === "99" ? "\u2014" : "12345678"}
                    value={newForm.nro_doc_receptor}
                    onChange={(e) => {
                      setNewForm((p) => ({ ...p, nro_doc_receptor: e.target.value }))
                      setPadronStatus("idle")
                      setPadronMsg("")
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        lookupPadron(newForm.nro_doc_receptor, newForm.tipo_doc_receptor)
                      }
                    }}
                    onBlur={() => lookupPadron(newForm.nro_doc_receptor, newForm.tipo_doc_receptor)}
                    disabled={newForm.tipo_doc_receptor === "99"}
                    className={`pr-8 ${padronStatus === "found" ? "border-emerald-500/50" : padronStatus === "error" ? "border-amber-500/50" : ""}`}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    {padronStatus === "loading" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    {padronStatus === "found" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    {padronStatus === "error" && <X className="h-3.5 w-3.5 text-amber-400" />}
                  </span>
                </div>
                {padronStatus === "found" && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {padronMsg}
                  </p>
                )}
                {padronStatus === "error" && (
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <X className="h-3 w-3" />
                    {padronMsg}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Condici&oacute;n frente al IVA</Label>
                <Select
                  value={newForm.receptor_condicion_iva}
                  onValueChange={(v) => setNewForm((p) => ({ ...p, receptor_condicion_iva: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDICION_IVA_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Domicilio (opcional)</Label>
                <Input
                  placeholder="Av. Siempre Viva 742"
                  value={newForm.receptor_domicilio}
                  onChange={(e) => setNewForm((p) => ({ ...p, receptor_domicilio: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm">&Iacute;tems</h4>
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1 h-7">
                <Plus className="h-3 w-3" />
                Agregar &iacute;tem
              </Button>
            </div>
            <div className="space-y-3">
              {/* Header */}
              <div className="grid grid-cols-[110px_1fr_60px_90px_80px_80px_24px] gap-2 text-xs text-muted-foreground px-1">
                <span className="flex items-center gap-1">
                  <Barcode className="h-3 w-3" />
                  SKU / EAN
                </span>
                <span>Descripci&oacute;n</span>
                <span className="text-center">Cant.</span>
                <span className="text-right">Precio</span>
                <span className="text-center">IVA</span>
                <span className="text-right">Subtotal</span>
                <span />
              </div>
              {items.map((item, idx) => {
                const c = calcItem(item)
                const status = skuStatus[idx] ?? "idle"
                return (
                  <div key={idx} className="space-y-1">
                    <div className="grid grid-cols-[110px_1fr_60px_90px_80px_80px_24px] gap-2 items-center">
                      {/* SKU / EAN lookup */}
                      <div className="relative">
                        <Input
                          placeholder="SKU o EAN"
                          className={`h-8 text-xs pr-7 font-mono ${
                            status === "found"
                              ? "border-emerald-500/50 bg-emerald-500/5"
                              : status === "notfound"
                                ? "border-amber-500/50"
                                : ""
                          }`}
                          value={skuInput[idx] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value
                            setSkuInput((prev) => {
                              const n = [...prev]
                              n[idx] = val
                              return n
                            })
                            setSkuStatus((prev) => {
                              const n = [...prev]
                              n[idx] = "idle"
                              return n
                            })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              lookupProduct(idx, skuInput[idx] ?? "")
                            }
                          }}
                          onBlur={() => {
                            if ((skuInput[idx] ?? "").trim()) lookupProduct(idx, skuInput[idx] ?? "")
                          }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2">
                          {status === "loading" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                          {status === "found" && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                          {status === "notfound" && <X className="h-3 w-3 text-amber-400" />}
                        </span>
                      </div>
                      <Input
                        placeholder="Descripci&oacute;n del producto"
                        className="h-8 text-xs"
                        value={item.descripcion || ""}
                        onChange={(e) => updateItem(idx, "descripcion", e.target.value)}
                      />
                      <Input
                        type="number"
                        min="1"
                        className="h-8 text-xs text-center"
                        value={item.cantidad || ""}
                        onChange={(e) => updateItem(idx, "cantidad", Number(e.target.value))}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-8 text-xs text-right"
                        value={item.precio_unitario || ""}
                        onChange={(e) => updateItem(idx, "precio_unitario", Number(e.target.value))}
                      />
                      <Select
                        value={String(item.alicuota_iva ?? 21)}
                        onValueChange={(v) => updateItem(idx, "alicuota_iva", Number(v))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IVA_OPTS.map((o) => (
                            <SelectItem key={o.value} value={String(o.value)}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-right font-mono">${c.subtotal.toFixed(2)}</span>
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {status === "notfound" && (skuInput[idx] ?? "").trim() && (
                      <p className="text-xs text-amber-400 pl-[118px]">
                        No se encontr&oacute; &quot;{skuInput[idx]}&quot; en la base de productos. Pod&eacute;s escribir
                        la descripci&oacute;n manualmente.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Totales */}
            <div className="mt-4 pt-3 border-t border-border flex justify-end">
              <div className="text-sm space-y-1 w-48">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal neto</span>
                  <span className="font-mono">${totales.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA</span>
                  <span className="font-mono">${totales.iva.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-border pt-1">
                  <span>Total</span>
                  <span className="font-mono">${totales.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Advertencia RG 5700/2025 */}
          {(() => {
            const total = totales.total
            const docTipo = newForm.tipo_doc_receptor
            const docNro = newForm.nro_doc_receptor?.replace(/\D/g, "")
            if (total >= 10_000_000 && (docTipo === "99" || !docNro)) {
              return (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-400 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Identificaci&oacute;n obligatoria (RG ARCA 5700/2025)</p>
                    <p>
                      El total supera <strong>$10.000.000</strong>. Es obligatorio identificar al receptor con CUIT,
                      CUIL, CDI o DNI. Seleccion&aacute; el tipo de documento e ingres&aacute; el n&uacute;mero.
                    </p>
                  </div>
                </div>
              )
            }
            if (total >= 208_644 && total < 10_000_000 && docTipo === "99") {
              return (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-400 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Pod&eacute;s emitir sin identificar al receptor hasta <strong>$10.000.000</strong> (RG 5700/2025).
                    El monto actual es ${total.toLocaleString("es-AR")}.
                  </p>
                </div>
              )
            }
            return null
          })()}

          {emitError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex items-start gap-2">
              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{emitError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={emitirFactura} disabled={emitting} className="gap-2">
            {emitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {emitting ? "Solicitando CAE..." : "Emitir factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
