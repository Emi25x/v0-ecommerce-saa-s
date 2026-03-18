"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Edit,
  Trash2,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Package,
} from "lucide-react"
import type { Product, SortOrder } from "@/components/inventory/types"

interface ProductTableProps {
  products: Product[]
  loading: boolean
  searchQuery: string
  selectedProducts: Set<string>
  sortBy: string
  sortOrder: SortOrder
  onSort: (column: string) => void
  onToggleSelectAll: () => void
  onToggleSelectProduct: (id: string) => void
  onEditProduct: (product: Product) => void
  onViewDetails: (product: Product) => void
  onDeleteProduct: (product: Product) => void
}

export function ProductTable({
  products,
  loading,
  searchQuery,
  selectedProducts,
  sortBy,
  sortOrder,
  onSort,
  onToggleSelectAll,
  onToggleSelectProduct,
  onEditProduct,
  onViewDetails,
  onDeleteProduct,
}: ProductTableProps) {
  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />
    }
    return sortOrder === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
  }

  return (
    <div className="rounded-lg border-2 border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="border-r-2 border-border w-12">
              <input
                type="checkbox"
                checked={selectedProducts.size === products.length && products.length > 0}
                onChange={onToggleSelectAll}
                className="cursor-pointer"
              />
            </TableHead>
            <TableHead className="border-r-2 border-border w-16">Imagen</TableHead>
            <TableHead className="border-r-2 border-border">SKU</TableHead>
            <TableHead className="border-r-2 border-border">EAN</TableHead>
            <TableHead className="border-r-2 border-border">T\u00edtulo</TableHead>
            <TableHead className="border-r-2 border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSort("price")}
                className="hover:bg-transparent p-0 h-auto font-semibold"
              >
                Precio
                {getSortIcon("price")}
              </Button>
            </TableHead>
            <TableHead className="border-r-2 border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSort("stock")}
                className="hover:bg-transparent p-0 h-auto font-semibold"
              >
                Stock
                {getSortIcon("stock")}
              </Button>
            </TableHead>
            <TableHead className="border-r-2 border-border font-semibold">Fuente</TableHead>
            <TableHead className="border-r-2 border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSort("created_at")}
                className="hover:bg-transparent p-0 h-auto font-semibold"
              >
                Fecha Creaci\u00f3n
                {getSortIcon("created_at")}
              </Button>
            </TableHead>
            <TableHead className="border-r-2 border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSort("updated_at")}
                className="hover:bg-transparent p-0 h-auto font-semibold"
              >
                \u00daltima Actualizaci\u00f3n
                {getSortIcon("updated_at")}
              </Button>
            </TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8">
                Cargando productos...
              </TableCell>
            </TableRow>
          ) : products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8">
                {searchQuery
                  ? `No se encontraron productos que coincidan con "${searchQuery}"`
                  : "No se encontraron productos"}
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="border-r-2 border-border">
                  <input
                    type="checkbox"
                    checked={selectedProducts.has(product.id)}
                    onChange={() => onToggleSelectProduct(product.id)}
                    className="cursor-pointer"
                  />
                </TableCell>
                <TableCell className="border-r-2 border-border p-2">
                  {product.url_template || product.image_url ? (
                    <img
                      src={product.url_template || product.image_url}
                      alt={product.title || "Producto"}
                      className="w-12 h-12 object-cover rounded border border-border"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder.svg?height=50&width=50"
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded border border-border flex items-center justify-center">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="border-r-2 border-border font-mono text-sm">{product.sku}</TableCell>
                <TableCell className="border-r-2 border-border font-mono text-xs text-muted-foreground">{product.ean || "\u2014"}</TableCell>
                <TableCell className="border-r-2 border-border max-w-xs truncate">{product.title}</TableCell>
                <TableCell className="border-r-2 border-border font-mono">
                  ${product.price != null ? product.price.toFixed(2) : "N/A"}
                </TableCell>
                <TableCell className="border-r-2 border-border">{product.stock ?? "N/A"}</TableCell>
                <TableCell className="border-r-2 border-border">
                  {Array.isArray(product.source) && product.source.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {product.source.slice(0, 2).map((src: string, idx: number) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {src}
                        </Badge>
                      ))}
                      {product.source.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{product.source.length - 2}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">Sin fuente</span>
                  )}
                </TableCell>
                <TableCell className="border-r-2 border-border text-sm text-muted-foreground">
                  {product.created_at ? new Date(product.created_at).toLocaleDateString() : "N/A"}
                </TableCell>
                <TableCell className="border-r-2 border-border text-sm text-muted-foreground">
                  {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : "N/A"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEditProduct(product)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onViewDetails(product)}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteProduct(product)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
