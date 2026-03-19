"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Product } from "@/components/inventory/types"

interface DeleteProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deletingProduct: Product | null
  onDelete: () => void
  onCancel: () => void
}

export function DeleteProductDialog({
  open,
  onOpenChange,
  deletingProduct,
  onDelete,
  onCancel,
}: DeleteProductDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Eliminaci&oacute;n</DialogTitle>
          <DialogDescription>
            &iquest;Est&aacute;s seguro de que deseas eliminar este producto? Esta acci&oacute;n no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {deletingProduct && (
          <div className="py-4">
            <p className="font-semibold">{deletingProduct.title}</p>
            <p className="text-sm text-muted-foreground">SKU: {deletingProduct.sku}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
