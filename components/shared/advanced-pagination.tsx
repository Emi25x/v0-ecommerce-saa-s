"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

interface AdvancedPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  disabled?: boolean
  itemsPerPage: number
  totalItems: number
  offset: number
}

export function AdvancedPagination({
  currentPage,
  totalPages,
  onPageChange,
  disabled = false,
  itemsPerPage,
  totalItems,
  offset,
}: AdvancedPaginationProps) {
  const [pageInput, setPageInput] = useState("")

  const handleGoToPage = () => {
    const page = Number.parseInt(pageInput)
    if (page >= 1 && page <= totalPages) {
      onPageChange(page)
      setPageInput("")
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleGoToPage()
    }
  }

  return (
    <div className="flex items-center justify-between border-t pt-4">
      <div className="text-sm text-muted-foreground">
        Mostrando {offset + 1} - {Math.min(offset + itemsPerPage, totalItems)} de {totalItems.toLocaleString()}
      </div>
      <div className="flex items-center gap-2">
        {/* Primera página */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1 || disabled}
          title="Primera página"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        {/* Página anterior */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || disabled}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Anterior
        </Button>

        {/* Indicador de página actual */}
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">
            Página {currentPage} de {totalPages}
          </span>
        </div>

        {/* Página siguiente */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || disabled}
        >
          Siguiente
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>

        {/* Última página */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || disabled}
          title="Última página"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>

        {/* Input para ir a página específica */}
        <div className="flex items-center gap-2 border-l pl-4">
          <span className="text-sm text-muted-foreground">Ir a:</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`1-${totalPages}`}
            className="w-20 h-9"
            disabled={disabled}
          />
          <Button variant="outline" size="sm" onClick={handleGoToPage} disabled={disabled || !pageInput}>
            Ir
          </Button>
        </div>
      </div>
    </div>
  )
}
