"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Product } from "@/components/inventory/types"

interface EditProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingProduct: Product | null
  onEditingProductChange: (product: Product) => void
  onSave: () => void
}

export function EditProductDialog({
  open,
  onOpenChange,
  editingProduct,
  onEditingProductChange,
  onSave,
}: EditProductDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Producto</DialogTitle>
        </DialogHeader>
        {editingProduct && (
          <div className="space-y-4">
            <div>
              <Label>SKU</Label>
              <Input
                value={editingProduct.sku || ""}
                onChange={(e) => onEditingProductChange({ ...editingProduct, sku: e.target.value })}
              />
            </div>
            <div>
              <Label>T&iacute;tulo</Label>
              <Input
                value={editingProduct.title || ""}
                onChange={(e) => onEditingProductChange({ ...editingProduct, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Descripci&oacute;n</Label>
              <Textarea
                value={editingProduct.description || ""}
                onChange={(e) =>
                  onEditingProductChange({
                    ...editingProduct,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Precio</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingProduct.price || ""}
                  onChange={(e) =>
                    onEditingProductChange({
                      ...editingProduct,
                      price: Number.parseFloat(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Stock</Label>
                <Input
                  type="number"
                  value={editingProduct.stock || ""}
                  onChange={(e) =>
                    onEditingProductChange({
                      ...editingProduct,
                      stock: Number.parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
