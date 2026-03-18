"use client"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Product } from "@/components/inventory/types"

interface ProductDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
}

export function ProductDetailsDialog({
  open,
  onOpenChange,
  product,
}: ProductDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalles del Producto</DialogTitle>
        </DialogHeader>
        {product && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">SKU</Label>
                <p className="font-mono">{product.sku}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">C&oacute;digo Interno</Label>
                <p className="font-mono">{product.internal_code || "N/A"}</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">T&iacute;tulo</Label>
              <p>{product.title}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Descripci&oacute;n</Label>
              <p className="text-sm">{product.description || "N/A"}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-muted-foreground">Precio</Label>
                <p className="font-mono">
                  ${product.price != null ? product.price.toFixed(2) : "N/A"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Stock</Label>
                <p>{product.stock ?? "N/A"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Condici&oacute;n</Label>
                <p>{product.condition || "N/A"}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Marca</Label>
                <p>{product.brand || "N/A"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Categor&iacute;a</Label>
                <p>{product.category || "N/A"}</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Fuentes</Label>
              {product.source &&
              Array.isArray(product.source) &&
              product.source.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-1">
                  {product.source.map((src: string, idx: number) => (
                    <Badge key={idx} variant="secondary">
                      {src}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm">Sin fuentes</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Fecha de Creaci&oacute;n</Label>
                <p className="text-sm">
                  {product.created_at ? new Date(product.created_at).toLocaleString() : "N/A"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">&Uacute;ltima Actualizaci&oacute;n</Label>
                <p className="text-sm">
                  {product.updated_at ? new Date(product.updated_at).toLocaleString() : "N/A"}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
