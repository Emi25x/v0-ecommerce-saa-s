"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ShopifyStoreCard } from "@/components/shopify/store-card"
import { ShopifyStoreDialog } from "@/components/shopify/store-dialog"
import { useToast } from "@/hooks/use-toast"
import { Plus, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

interface ShopifyStore {
  id: string
  shop_domain: string
  access_token: string
  default_location_id: string | null
  is_active: boolean
  created_at: string
}

export default function ShopifyStoresPage() {
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<ShopifyStore | null>(null)
  const { toast } = useToast()

  const loadStores = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/shopify/stores")
      const data = await response.json()

      if (response.ok) {
        setStores(data.stores || [])
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar las tiendas",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const searchParams = useSearchParams()

  useEffect(() => {
    loadStores()
    // Handle OAuth callback results
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    if (success) {
      toast({ title: "Tienda conectada", description: success })
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname)
    } else if (error) {
      toast({ title: "Error de conexión", description: error, variant: "destructive" })
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  const handleEdit = (store: ShopifyStore) => {
    setEditingStore(store)
    setDialogOpen(true)
  }

  const handleDelete = async (storeId: string) => {
    try {
      const response = await fetch(`/api/shopify/stores/${storeId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Éxito",
          description: "Tienda eliminada correctamente",
        })
        loadStores()
      } else {
        throw new Error("Failed to delete store")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la tienda",
        variant: "destructive",
      })
    }
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingStore(null)
  }

  const handleSuccess = () => {
    loadStores()
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Link href="/integrations">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Integraciones
          </Button>
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tiendas Shopify</h1>
            <p className="text-muted-foreground mt-2">
              Gestiona tus tiendas de Shopify conectadas
            </p>
          </div>

          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar Tienda
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stores.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <h3 className="text-lg font-semibold mb-2">No hay tiendas conectadas</h3>
          <p className="text-muted-foreground mb-4">
            Conecta tu primera tienda de Shopify para comenzar
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar Primera Tienda
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {stores.map((store) => (
            <ShopifyStoreCard
              key={store.id}
              store={store as any}
              onEdit={handleEdit as any}
              onDelete={handleDelete as any}
              onRefresh={loadStores}
            />
          ))}
        </div>
      )}

      <ShopifyStoreDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        onSuccess={handleSuccess}
        store={editingStore}
      />
    </div>
  )
}
