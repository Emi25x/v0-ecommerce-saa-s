"use client"

import { useState, useEffect } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"

interface Warehouse {
  id: string
  name: string
  code: string
  address: string | null
  notes: string | null
  is_default: boolean
}

interface WarehouseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouse?: Warehouse | null
  onSuccess: () => void
}

export function WarehouseDialog({ open, onOpenChange, warehouse, onSuccess }: WarehouseDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (warehouse) {
      setName(warehouse.name)
      setCode(warehouse.code)
      setAddress(warehouse.address || "")
      setNotes(warehouse.notes || "")
      setIsDefault(warehouse.is_default)
    } else {
      setName("")
      setCode("")
      setAddress("")
      setNotes("")
      setIsDefault(false)
    }
  }, [warehouse])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = warehouse ? `/api/warehouses/${warehouse.id}` : "/api/warehouses"
      const method = warehouse ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: code.toUpperCase(),
          address: address || null,
          notes: notes || null,
          is_default: isDefault,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save warehouse")
      }

      toast({
        title: warehouse ? "Almacén actualizado" : "Almacén creado",
        description: `${name} se ha guardado correctamente`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al guardar almacén",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{warehouse ? "Editar Almacén" : "Nuevo Almacén"}</DialogTitle>
            <DialogDescription>
              {warehouse ? "Modifica los datos del almacén" : "Crea un nuevo almacén para gestionar tu inventario"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Almacén Central"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ej: ALM01"
                required
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">Identificador único para el almacén</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, ciudad, país"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Información adicional sobre este almacén"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="default">Almacén por defecto</Label>
                <p className="text-xs text-muted-foreground">Se usará automáticamente en las importaciones</p>
              </div>
              <Switch id="default" checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : warehouse ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
