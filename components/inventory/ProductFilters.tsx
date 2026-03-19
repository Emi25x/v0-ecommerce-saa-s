"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, RefreshCw } from "lucide-react"

interface ProductFiltersProps {
  searchQuery: string
  debouncedSearch: string
  onSearchChange: (value: string) => void
  onRefresh: () => void
}

export function ProductFilters({ searchQuery, debouncedSearch, onSearchChange, onRefresh }: ProductFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Buscar por SKU, t\u00edtulo o descripci\u00f3n..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
        {searchQuery !== debouncedSearch && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>
      <Button variant="outline" onClick={onRefresh}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Actualizar
      </Button>
    </div>
  )
}
