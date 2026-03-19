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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ResetDatabaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  confirmText: string
  onConfirmTextChange: (text: string) => void
  loading: boolean
  onReset: () => void
}

export function ResetDatabaseDialog({
  open,
  onOpenChange,
  confirmText,
  onConfirmTextChange,
  loading,
  onReset,
}: ResetDatabaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reiniciar Base de Datos</DialogTitle>
          <DialogDescription>
            Esta acción eliminará TODOS los productos de la base de datos. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="confirm-text">
              Escribe <span className="font-mono font-bold">ELIMINAR TODO</span> para confirmar
            </Label>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => onConfirmTextChange(e.target.value)}
              placeholder="ELIMINAR TODO"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onReset} disabled={confirmText !== "ELIMINAR TODO" || loading}>
            Restablecer todo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
