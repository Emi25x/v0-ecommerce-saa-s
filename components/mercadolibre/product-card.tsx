"use client"

import { useState } from "react"
import { toast } from "@/hooks/use-toast"
import type { Product } from "@/types/product"

const ProductCard = ({ product, onUpdate }: { product: Product; onUpdate: () => void }) => {
  const [isActivatingCatalog, setIsActivatingCatalog] = useState(false)

  const handleActivateCatalog = async () => {
    if (!product.id) return

    setIsActivatingCatalog(true)
    try {
      const response = await fetch("/api/mercadolibre/products/activate-catalog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: product.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: "Error al activar catálogo",
          description: data.error || "No se pudo activar el catálogo para este producto",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Catálogo activado",
        description: data.message || "El producto ahora es una publicación de catálogo",
      })

      if (onUpdate) {
        onUpdate()
      }
    } catch (error) {
      console.error("Error activating catalog:", error)
      toast({
        title: "Error",
        description: "Ocurrió un error al activar el catálogo",
        variant: "destructive",
      })
    } finally {
      setIsActivatingCatalog(false)
    }
  }

  return (
    <div>
      {/* ... existing JSX code ... */}
      <button onClick={handleActivateCatalog} disabled={isActivatingCatalog}>
        Activar Catálogo
      </button>
    </div>
  )
}

export default ProductCard
