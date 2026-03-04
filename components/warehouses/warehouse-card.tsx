"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { MapPin, MoreVertical, Edit, Trash2, CheckCircle2 } from "lucide-react"
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

interface WarehouseCardProps {
  warehouse: Warehouse
  onEdit: (warehouse: Warehouse) => void
  onDelete: (id: string) => void
}

export function WarehouseCard({ warehouse, onEdit, onDelete }: WarehouseCardProps) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`¿Estás seguro de eliminar el almacén "${warehouse.name}"?`)) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(`/api/warehouses/${warehouse.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete warehouse")
      }

      toast({
        title: "Almacén eliminado",
        description: `${warehouse.name} ha sido eliminado`,
      })

      onDelete(warehouse.id)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al eliminar almacén",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">{warehouse.name}</CardTitle>
            {warehouse.is_default && (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Por defecto
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{warehouse.code}</Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={deleting}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(warehouse)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-2">
        {warehouse.address && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{warehouse.address}</span>
          </div>
        )}
        {warehouse.notes && (
          <p className="text-sm text-muted-foreground">{warehouse.notes}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Creado: {new Date(warehouse.created_at).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  )
}
