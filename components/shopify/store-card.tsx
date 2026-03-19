"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreVertical, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ShopifyStore {
  id: string
  shop_domain: string
  default_location_id: string | null
  is_active: boolean
  created_at: string
}

interface ShopifyStoreCardProps {
  store: ShopifyStore
  onEdit: (store: ShopifyStore) => void
  onDelete: (storeId: string) => void
  onRefresh: () => void
}

export function ShopifyStoreCard({ store, onEdit, onDelete, onRefresh }: ShopifyStoreCardProps) {
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle")
  const { toast } = useToast()

  const testConnection = async () => {
    setTesting(true)
    setConnectionStatus("idle")

    try {
      const response = await fetch(`/api/shopify/test-connection?store_id=${store.id}`)
      const data = await response.json()

      if (data.connected) {
        setConnectionStatus("success")
        toast({
          title: "Conexión exitosa",
          description: `Conectado a ${store.shop_domain}`,
        })
      } else {
        setConnectionStatus("error")
        toast({
          title: "Error de conexión",
          description: data.error || "No se pudo conectar a Shopify",
          variant: "destructive",
        })
      }
    } catch (error) {
      setConnectionStatus("error")
      toast({
        title: "Error",
        description: "Error al probar la conexión",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const toggleActive = async () => {
    try {
      const response = await fetch(`/api/shopify/stores/${store.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !store.is_active }),
      })

      if (response.ok) {
        toast({
          title: "Actualizado",
          description: `Tienda ${store.is_active ? "desactivada" : "activada"}`,
        })
        onRefresh()
      } else {
        throw new Error("Failed to toggle active status")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      })
    }
  }

  const handleDelete = () => {
    if (confirm(`¿Eliminar la tienda ${store.shop_domain}?`)) {
      onDelete(store.id)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold">{(store as any).name || store.shop_domain}</h3>
            <Badge variant={store.is_active ? "default" : "secondary"}>{store.is_active ? "Activa" : "Inactiva"}</Badge>
            {connectionStatus === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {connectionStatus === "error" && <XCircle className="h-4 w-4 text-red-500" />}
          </div>

          {(store as any).name && <p className="text-sm text-muted-foreground">{store.shop_domain}</p>}

          {store.default_location_id && (
            <p className="text-sm text-muted-foreground">Location: {store.default_location_id}</p>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            Agregada: {new Date(store.created_at).toLocaleDateString()}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(store)}>Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={toggleActive}>{store.is_active ? "Desactivar" : "Activar"}</DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-red-600">
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full mt-4"
        onClick={testConnection}
        disabled={testing || !store.is_active}
      >
        {testing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Probando...
          </>
        ) : (
          "Probar Conexión"
        )}
      </Button>
    </Card>
  )
}
