"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  RefreshCw,
  Eye,
  AlertCircle,
  Check,
} from "lucide-react"
import type {
  Order,
  MlBrowserModal,
  ConfirmMarkReceived,
  ReturnDetails,
} from "@/components/orders/types"
import { getReturnStatusLabel, getReturnMoneyStatusLabel } from "@/components/orders/types"

const MLLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 0C10.745 0 0 10.745 0 24s10.745 24 24 24 24-10.745 24-24S37.255 0 24 0z" fill="#FFE600" />
    <path
      d="M35.5 18.5c0-1.933-1.567-3.5-3.5-3.5s-3.5 1.567-3.5 3.5v11c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-11zM24 12c-1.933 0-3.5 1.567-3.5 3.5v19c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-19c0-1.933-1.567-3.5-3.5-3.5zM16 18.5c0-1.933-1.567-3.5-3.5-3.5s9 16.567 9 18.5v11c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-11z"
      fill="#2D3277"
    />
  </svg>
)

function getStatusBadge(status: string) {
  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> =
    {
      paid: { variant: "default", label: "Pagado" },
      confirmed: { variant: "default", label: "Confirmado" },
      payment_required: { variant: "outline", label: "Pago Requerido" },
      payment_in_process: { variant: "outline", label: "Pago en Proceso" },
      cancelled: { variant: "destructive", label: "Cancelado" },
      invalid: { variant: "destructive", label: "Invalido" },
    }

  const config = statusConfig[status] || { variant: "secondary" as const, label: status }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function getPaymentStatusBadge(status: string) {
  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> =
    {
      approved: { variant: "default", label: "Aprobado" },
      pending: { variant: "outline", label: "Pendiente" },
      in_process: { variant: "outline", label: "En Proceso" },
      rejected: { variant: "destructive", label: "Rechazado" },
      cancelled: { variant: "destructive", label: "Cancelado" },
      refunded: { variant: "secondary", label: "Reembolsado" },
    }

  const config = statusConfig[status] || { variant: "secondary" as const, label: status }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

interface OrderDialogsProps {
  // Order details dialog
  showOrderDetails: boolean
  setShowOrderDetails: (v: boolean) => void
  selectedOrder: Order | null
  // ML Browser modal
  mlBrowserModal: MlBrowserModal | null
  setMlBrowserModal: (v: MlBrowserModal | null) => void
  copyToClipboard: (text: string) => void
  // Return details dialog
  returnDetailsOpen: boolean
  setReturnDetailsOpen: (v: boolean) => void
  returnDetails: ReturnDetails | null
  loadingReturnDetails: boolean
  // Return claim dialog
  showReturnDialog: boolean
  setShowReturnDialog: (v: boolean) => void
  selectedReturnOrder: Order | null
  fetchReturnDetails: (claimId: number) => void
  // Delivery confirm dialog
  showDeliveryConfirmDialog: boolean
  setShowDeliveryConfirmDialog: (v: boolean) => void
  isMarkingDelivered: boolean
  handleMarkAsDelivered: () => void
  // Mark received confirm dialog
  confirmMarkReceived: ConfirmMarkReceived | null
  setConfirmMarkReceived: (v: ConfirmMarkReceived | null) => void
  confirmAndMarkReceived: () => void
}

export function OrderDialogs({
  showOrderDetails,
  setShowOrderDetails,
  selectedOrder,
  mlBrowserModal,
  setMlBrowserModal,
  copyToClipboard,
  returnDetailsOpen,
  setReturnDetailsOpen,
  returnDetails,
  loadingReturnDetails,
  showReturnDialog,
  setShowReturnDialog,
  selectedReturnOrder,
  fetchReturnDetails,
  showDeliveryConfirmDialog,
  setShowDeliveryConfirmDialog,
  isMarkingDelivered,
  handleMarkAsDelivered,
  confirmMarkReceived,
  setConfirmMarkReceived,
  confirmAndMarkReceived,
}: OrderDialogsProps) {
  return (
    <>
      {/* Order Details Dialog */}
      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl">Orden #{selectedOrder?.id}</DialogTitle>
            <DialogDescription>Detalles de la orden</DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                  Estado de la Orden
                </h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Estado:</span>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fecha de Creacion:</span>
                    <span className="font-medium">{new Date(selectedOrder.date_created).toLocaleString()}</span>
                  </div>
                  {selectedOrder.date_closed && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fecha de Cierre:</span>
                      <span className="font-medium">{new Date(selectedOrder.date_closed).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    Informacion de Pago
                  </h3>
                  <div className="grid gap-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Estado:</span>
                      {getPaymentStatusBadge(selectedOrder.payments[0].status)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Metodo:</span>
                      <span className="font-medium capitalize">
                        {selectedOrder.payments[0].payment_type_id?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-semibold pt-2 border-t">
                      <span>Monto Total:</span>
                      <span className="text-green-600">
                        {selectedOrder.currency_id} ${selectedOrder.payments[0].transaction_amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  Datos del Comprador
                </h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Usuario:</span>
                    <span className="font-medium">@{selectedOrder.buyer.nickname}</span>
                  </div>
                  {selectedOrder.buyer.email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{selectedOrder.buyer.email}</span>
                    </div>
                  )}
                  {selectedOrder.buyer.phone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Telefono:</span>
                      <span className="font-medium">
                        {selectedOrder.buyer.phone.area_code && `(${selectedOrder.buyer.phone.area_code}) `}
                        {selectedOrder.buyer.phone.number}
                      </span>
                    </div>
                  )}
                  {selectedOrder.buyer.first_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nombre:</span>
                      <span className="font-medium">
                        {selectedOrder.buyer.first_name} {selectedOrder.buyer.last_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Items de la Orden</h3>
                {selectedOrder.order_items.map((item, index) => (
                  <div key={index} className="bg-muted/50 p-4 rounded-lg">
                    <div className="flex gap-4">
                      {item.item.thumbnail && (
                        <img
                          src={item.item.thumbnail || "/placeholder.svg"}
                          alt={item.item.title}
                          className="w-20 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold mb-1">{item.item.title}</h4>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm text-muted-foreground">MLA: {item.item.id}</p>
                          {item.item.seller_sku && (
                            <>
                              <span className="text-muted-foreground">&bull;</span>
                              <code className="rounded bg-background px-2 py-0.5 text-xs font-mono border border-border/50">
                                SKU: {item.item.seller_sku}
                              </code>
                            </>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Precio Unitario:</span>
                            <p className="font-medium">
                              {selectedOrder.currency_id} ${item.unit_price.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cantidad:</span>
                            <p className="font-medium">{item.quantity}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-primary/10 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Total de la Orden:</span>
                  <span className="text-2xl font-bold text-primary">
                    {selectedOrder.currency_id} ${selectedOrder.total_amount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ML Browser Modal */}
      <Dialog open={!!(mlBrowserModal && mlBrowserModal.open)} onOpenChange={(open) => !open && setMlBrowserModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MLLogo className="h-6 w-6" />
              Abrir en MercadoLibre
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
              <p className="text-sm font-medium text-blue-900 mb-1">Cuenta: {mlBrowserModal?.accountNickname}</p>
              {mlBrowserModal?.browserPreference && (
                <p className="text-sm text-blue-700">
                  Navegador recomendado: <span className="font-semibold">{mlBrowserModal.browserPreference}</span>
                </p>
              )}
            </div>

            {mlBrowserModal?.browserPreference ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Para evitar conflictos entre cuentas, abri esta orden en el navegador configurado para esta cuenta.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      copyToClipboard(mlBrowserModal?.url)
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Copiar URL
                  </Button>
                  <Button
                    onClick={() => {
                      window.open(mlBrowserModal?.url, "_blank")
                      setMlBrowserModal(null)
                    }}
                    className="w-full"
                  >
                    Abrir de todas formas
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  No hay navegador configurado para esta cuenta. Podes configurarlo en la seccion de cuentas de
                  MercadoLibre.
                </p>
                <Button
                  onClick={() => {
                    window.open(mlBrowserModal?.url, "_blank")
                    setMlBrowserModal(null)
                  }}
                  className="w-full"
                >
                  Abrir en navegador actual
                </Button>
              </div>
            )}

            <div className="text-xs text-gray-500 pt-2 border-t">
              <p className="font-medium mb-1">Tip: Configura navegadores por cuenta</p>
              <p>Usa diferentes navegadores o perfiles para cada cuenta de ML:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Chrome Perfil 1 para Cuenta A</li>
                <li>Firefox para Cuenta B</li>
                <li>Chrome Incognito para Cuenta C</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Details Dialog */}
      <Dialog open={returnDetailsOpen} onOpenChange={setReturnDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de la Devolucion</DialogTitle>
            <DialogDescription>Informacion sobre el estado de la devolucion y el envio de retorno</DialogDescription>
          </DialogHeader>

          {loadingReturnDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : returnDetails ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Estado de la Devolucion</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <Badge variant="outline" className="mt-1">
                      {getReturnStatusLabel(returnDetails.status)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estado del Dinero</p>
                    <Badge
                      variant="outline"
                      className={`mt-1 ${
                        returnDetails.status_money === "refunded"
                          ? "bg-green-100 text-green-900 border-green-300"
                          : returnDetails.status_money === "retained"
                            ? "bg-yellow-100 text-yellow-900 border-yellow-300"
                            : "bg-gray-100 text-gray-900 border-gray-300"
                      }`}
                    >
                      {getReturnMoneyStatusLabel(returnDetails.status_money)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="text-sm font-medium mt-1">{returnDetails.type}</p>
                  </div>
                  {returnDetails.refund_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Reembolso en</p>
                      <p className="text-sm font-medium mt-1">{returnDetails.refund_at}</p>
                    </div>
                  )}
                </div>
              </div>

              {returnDetails.shipping && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Estado del Envio de Retorno</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Estado del Envio</p>
                      <Badge
                        variant="outline"
                        className={`mt-1 ${
                          returnDetails.shipping.status === "delivered"
                            ? "bg-green-100 text-green-900 border-green-300"
                            : returnDetails.shipping.status === "shipped"
                              ? "bg-blue-100 text-blue-900 border-blue-300"
                              : "bg-gray-100 text-gray-900 border-gray-300"
                        }`}
                      >
                        {getReturnStatusLabel(returnDetails.shipping.status)}
                      </Badge>
                    </div>
                    {returnDetails.shipping.tracking_number && (
                      <div>
                        <p className="text-xs text-muted-foreground">Numero de Seguimiento</p>
                        <p className="text-sm font-mono mt-1">{returnDetails.shipping.tracking_number}</p>
                      </div>
                    )}
                  </div>

                  {returnDetails.shipping.status_history && returnDetails.shipping.status_history.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground mb-2">Historial de Estados</p>
                      <div className="space-y-2">
                        {returnDetails.shipping.status_history.map((history, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="font-medium">{getReturnStatusLabel(history.status)}</span>
                            <span className="text-muted-foreground">
                              {new Date(history.date).toLocaleDateString()} -{" "}
                              {new Date(history.date).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Fechas</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Fecha de Creacion</p>
                    <p className="text-sm mt-1">
                      {new Date(returnDetails.date_created).toLocaleDateString()} -{" "}
                      {new Date(returnDetails.date_created).toLocaleTimeString()}
                    </p>
                  </div>
                  {returnDetails.date_closed && (
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha de Cierre</p>
                      <p className="text-sm mt-1">
                        {new Date(returnDetails.date_closed).toLocaleDateString()} -{" "}
                        {new Date(returnDetails.date_closed).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {returnDetails.shipping?.status === "delivered" && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    El producto devuelto ha sido entregado. Verifica que el producto este en buenas condiciones.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudieron cargar los detalles de la devolucion.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Return / Claim Dialog */}
      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalles del Reclamo</DialogTitle>
            <DialogDescription>Revisa la informacion detallada del reclamo activo.</DialogDescription>
          </DialogHeader>

          {selectedReturnOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <p className="font-medium">Orden: #{selectedReturnOrder.id}</p>
                <p className="text-sm text-muted-foreground">Cliente: {selectedReturnOrder.buyer.nickname}</p>
                <Separator className="my-2" />
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Tipo de Reclamo:</span>
                  <p className="text-sm font-medium">
                    {selectedReturnOrder.claim_id ? `Reclamo ID: ${selectedReturnOrder.claim_id}` : "N/A"}
                  </p>
                  {selectedReturnOrder.cancel_detail && (
                    <>
                      <span className="text-xs text-muted-foreground">Detalle de Cancelacion:</span>
                      <p className="text-sm font-medium">
                        {selectedReturnOrder.cancel_detail.description} (
                        {selectedReturnOrder.cancel_detail.requested_by === "buyer" ? "Comprador" : "Vendedor"})
                      </p>
                    </>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full bg-transparent"
                onClick={() => selectedReturnOrder.claim_id && fetchReturnDetails(selectedReturnOrder.claim_id)}
                disabled={loadingReturnDetails}
              >
                {loadingReturnDetails ? (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                    Cargando detalles...
                  </>
                ) : (
                  <>
                    <Eye className="mr-1 h-3 w-3" />
                    Ver detalles de la devolucion
                  </>
                )}
              </Button>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowReturnDialog(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark as Delivered Confirm */}
      <AlertDialog open={showDeliveryConfirmDialog} onOpenChange={setShowDeliveryConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar orden como entregada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto notificara a MercadoLibre que la orden ha sido entregada al comprador. Esta accion no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMarkingDelivered}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkAsDelivered}
              disabled={isMarkingDelivered}
              className="bg-green-600 hover:bg-green-700"
            >
              {isMarkingDelivered ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Marcando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Si, marcar como entregada
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Product as Received Confirm */}
      <Dialog open={!!confirmMarkReceived} onOpenChange={() => setConfirmMarkReceived(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Disponibilidad del Producto</DialogTitle>
            <DialogDescription>
              Ya tienes el producto listo para enviar? Esta accion marcara el producto como disponible en MercadoLibre.
            </DialogDescription>
          </DialogHeader>

          {confirmMarkReceived?.orderDetails && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Orden:</span>
                    <span className="font-mono font-semibold">#{confirmMarkReceived.orderDetails.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-medium">{confirmMarkReceived.orderDetails.buyer.nickname}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Producto:</span>
                    <p className="text-sm font-medium">{confirmMarkReceived.orderDetails.order_items[0].item.title}</p>
                    {confirmMarkReceived.orderDetails.order_items[0].item.seller_custom_field && (
                      <p className="text-xs text-muted-foreground mt-1">
                        SKU:{" "}
                        <span className="font-mono font-semibold">
                          {confirmMarkReceived.orderDetails.order_items[0].item.seller_custom_field}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="flex gap-2">
                  <div className="shrink-0">
                    <div className="rounded-full bg-blue-500 p-1">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  </div>
                  <div className="text-xs text-blue-900">
                    <p className="font-semibold mb-1">Que sucedera despues?</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>El producto se marcara como "listo para enviar"</li>
                      <li>La etiqueta de envio estara disponible</li>
                      <li>Podras imprimir la etiqueta desde la seccion de envios</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setConfirmMarkReceived(null)}>
                  Cancelar
                </Button>
                <Button onClick={confirmAndMarkReceived} className="bg-blue-600 hover:bg-blue-700">
                  <Check className="mr-2 h-4 w-4" />
                  Si, tengo el producto
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
