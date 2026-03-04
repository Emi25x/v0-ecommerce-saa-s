"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { WarehouseCard } from "@/components/warehouses/warehouse-card"
import { WarehouseDialog } from "@/components/warehouses/warehouse-dialog"
import { Plus, Warehouse as WarehouseIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Warehouse {
  id: string
  name: string
  code: string
  address: string | null
  notes: string | null
  is_default: boolean
  created_at: string
}

export default function WarehousesPage() {
  const { toast } = useToast()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)

  const fetchWarehouses = async () => {
    try {
      const response = await fetch("/api/warehouses")
      if (!response.ok) throw new Error("Failed to fetch warehouses")

      const data = await response.json()
      setWarehouses(data.warehouses || [])
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los almacenes",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWarehouses()
  }, [])

  const handleEdit = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse)
    setDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    setWarehouses(warehouses.filter((w) => w.id !== id))
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingWarehouse(null)
  }

  const handleSuccess = () => {
    fetchWarehouses()
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Almacenes</h1>
          <p className="text-muted-foreground mt-2">
            Gestiona tus ubicaciones de almacenamiento
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Almacén
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-6 mb-4">
            <WarehouseIcon className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No hay almacenes</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Crea tu primer almacén para comenzar a gestionar el inventario por ubicaciones
          </p>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Crear Primer Almacén
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((warehouse) => (
            <WarehouseCard
              key={warehouse.id}
              warehouse={warehouse}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <WarehouseDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        warehouse={editingWarehouse}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
