"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PRODUCTS_PER_PAGE } from "@/components/inventory/types"

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalProducts: number
  searchQuery: string
  onPageChange: (page: number) => void
}

export function Pagination({
  currentPage,
  totalPages,
  totalProducts,
  searchQuery,
  onPageChange,
}: PaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Mostrando {(currentPage - 1) * PRODUCTS_PER_PAGE + 1} a{" "}
        {Math.min(currentPage * PRODUCTS_PER_PAGE, totalProducts)} de {totalProducts} productos
        {searchQuery && ` (filtrando por "${searchQuery}")`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <div className="text-sm">
          P\u00e1gina {currentPage} de {totalPages}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
