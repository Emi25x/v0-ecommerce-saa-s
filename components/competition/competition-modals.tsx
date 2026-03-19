"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Product, EditForm, TrackingForm } from "@/components/competition/types"

interface EditProductModalProps {
  editingProduct: Product
  editForm: EditForm
  setEditForm: (form: EditForm) => void
  saveProductChanges: () => Promise<void>
  onClose: () => void
}

export function EditProductModal({
  editingProduct,
  editForm,
  setEditForm,
  saveProductChanges,
  onClose,
}: EditProductModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Editar Publicación</CardTitle>
          <CardDescription className="space-y-2">
            <div className="text-base font-mono">{editingProduct.id}</div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingProduct.catalog_listing && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                ⚠️ Este producto está en catálogo. El título no se puede modificar.
              </p>
            </div>
          )}

          <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
            <Label className="text-sm font-semibold text-blue-900 mb-2 block">SKU del Producto</Label>
            <div className="text-2xl font-bold text-blue-700">
              {editingProduct.seller_sku && editingProduct.seller_sku !== "N/A"
                ? editingProduct.seller_sku
                : "Sin SKU asignado"}
            </div>
            <p className="text-xs text-blue-600 mt-1">El SKU no se puede modificar desde aquí</p>
          </div>

          {editingProduct.competition?.price_to_win && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <Label className="text-sm font-semibold text-green-900 mb-2 block">💰 Precio Sugerido para Ganar</Label>
              <div className="text-3xl font-bold text-green-700">
                ${editingProduct.competition.price_to_win.toFixed(2)}
              </div>
              <p className="text-xs text-green-600 mt-1">
                Este es el precio recomendado por MercadoLibre para ganar la competencia
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-price" className="text-base font-semibold">
                Precio Actual
              </Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                value={editForm.price}
                onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                placeholder="0.00"
                className="text-lg font-semibold"
              />
              {editingProduct.competition?.price_to_win && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditForm({
                      ...editForm,
                      price: editingProduct.competition!.price_to_win!.toFixed(2),
                    })
                  }
                  className="w-full text-xs"
                >
                  Usar precio sugerido (${editingProduct.competition.price_to_win.toFixed(2)})
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-stock" className="text-base font-semibold">
                Stock Disponible
              </Label>
              <Input
                id="edit-stock"
                type="number"
                value={editForm.available_quantity}
                onChange={(e) => setEditForm({ ...editForm, available_quantity: e.target.value })}
                placeholder="0"
                className="text-lg font-semibold"
              />
            </div>
          </div>

          {editingProduct.image && (
            <div className="space-y-2">
              <Label>Vista Previa</Label>
              <img
                src={editingProduct.image || "/placeholder.svg"}
                alt={editingProduct.title}
                className="w-full h-48 object-contain rounded border"
              />
            </div>
          )}
        </CardContent>
        <div className="flex gap-2 p-6 border-t">
          <Button onClick={saveProductChanges} className="flex-1 bg-blue-600 hover:bg-blue-700">
            Guardar Cambios
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
        </div>
      </Card>
    </div>
  )
}

interface RepricingModalProps {
  trackingProduct: Product
  trackingForm: TrackingForm
  setTrackingForm: (form: TrackingForm) => void
  priceTrackings: { [key: string]: any }
  saveTrackingConfig: () => Promise<void>
  onClose: () => void
}

export function RepricingModal({
  trackingProduct,
  trackingForm,
  setTrackingForm,
  priceTrackings,
  saveTrackingConfig,
  onClose,
}: RepricingModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Repricing Automático</CardTitle>
          <CardDescription>
            <div>{trackingProduct.title}</div>
            <div className="text-xs mt-1">ID: {trackingProduct.id}</div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">Cómo funciona el repricing</h4>
            <ul className="text-xs space-y-1 text-gray-700">
              <li>
                • <strong>Con competidor:</strong> ajusta según la estrategia elegida, nunca debajo del mínimo
              </li>
              <li>
                • <strong>Sin competidor / sin stock:</strong> sube al precio objetivo o máximo
              </li>
              <li>
                • <strong>price_to_win &lt; mínimo:</strong> se queda en precio mínimo
              </li>
              <li>
                • <strong>Sin datos de ML:</strong> no toca el precio
              </li>
              <li>
                • <strong>Umbral:</strong> solo actúa si la diferencia es ≥ $1
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <Label className="text-base font-semibold">Activar Repricing Automático</Label>
              <p className="text-sm text-muted-foreground">El cron ajustará el precio cada hora</p>
            </div>
            <input
              type="checkbox"
              checked={trackingForm.enabled}
              onChange={(e) => setTrackingForm({ ...trackingForm, enabled: e.target.checked })}
              className="h-6 w-6 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <Label>Estrategia de Repricing</Label>
            <Select
              value={trackingForm.strategy}
              onValueChange={(v) => setTrackingForm({ ...trackingForm, strategy: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="win_buybox">🏆 Ganar Buybox — usar price_to_win de ML</SelectItem>
                <SelectItem value="follow_competitor">🤝 Igualar Competidor — mismo precio que el ganador</SelectItem>
                <SelectItem value="maximize_margin_if_alone">
                  💰 Maximizar Margen — sube a precio máximo cuando estoy solo
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {trackingForm.strategy === "win_buybox" &&
                "Usa el precio calculado por ML para ganar el buybox (puede ser ligeramente menor al competidor)"}
              {trackingForm.strategy === "follow_competitor" &&
                "Iguala el precio exacto del vendedor ganador actual, sin necesariamente ganar el buybox"}
              {trackingForm.strategy === "maximize_margin_if_alone" &&
                "Gana el buybox cuando hay competencia; sube directo al precio máximo cuando no hay competidores con stock"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="min-price">
              Precio Mínimo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="min-price"
              type="number"
              step="0.01"
              value={trackingForm.min_price}
              onChange={(e) => setTrackingForm({ ...trackingForm, min_price: e.target.value })}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">Piso de rentabilidad — nunca se bajará de este valor</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-price">
              Precio Máximo <span className="text-gray-400">(opcional)</span>
            </Label>
            <Input
              id="max-price"
              type="number"
              step="0.01"
              value={trackingForm.max_price}
              onChange={(e) => setTrackingForm({ ...trackingForm, max_price: e.target.value })}
              placeholder="Dejar vacío para sin techo"
            />
            <p className="text-xs text-muted-foreground">
              Techo — el precio no subirá más de este valor al seguir al competidor
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-price">
              Precio Objetivo <span className="text-gray-400">(opcional)</span>
            </Label>
            <Input
              id="target-price"
              type="number"
              step="0.01"
              value={trackingForm.target_price}
              onChange={(e) => setTrackingForm({ ...trackingForm, target_price: e.target.value })}
              placeholder="Dejar vacío para usar precio máximo"
            />
            <p className="text-xs text-muted-foreground">
              Precio al que sube cuando no hay competencia activa (escenarios 3 y 4)
            </p>
          </div>

          {trackingProduct.competition?.price_to_win && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Price to win actual:</span>
                <span className="text-lg font-bold text-green-600">
                  ${trackingProduct.competition.price_to_win.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {priceTrackings[trackingProduct.id] && (
            <div className="text-xs text-muted-foreground space-y-1 bg-gray-50 rounded p-3">
              {priceTrackings[trackingProduct.id].last_run_at && (
                <div>Última ejecución: {new Date(priceTrackings[trackingProduct.id].last_run_at).toLocaleString()}</div>
              )}
              {priceTrackings[trackingProduct.id].last_status && (
                <div>
                  Último estado: <strong>{priceTrackings[trackingProduct.id].last_status}</strong>
                </div>
              )}
              {priceTrackings[trackingProduct.id].last_our_price && (
                <div>
                  Último precio nuestro: <strong>${priceTrackings[trackingProduct.id].last_our_price}</strong>
                </div>
              )}
              {priceTrackings[trackingProduct.id].last_price_to_win && (
                <div>
                  Último price_to_win: <strong>${priceTrackings[trackingProduct.id].last_price_to_win}</strong>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <div className="flex gap-2 p-6 border-t">
          <Button onClick={saveTrackingConfig} className="flex-1">
            Guardar Configuración
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
        </div>
      </Card>
    </div>
  )
}
