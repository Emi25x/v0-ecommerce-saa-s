"use client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Columns3 } from "lucide-react"

interface Column {
  id: string
  label: string
  enabled: boolean
}

interface ColumnSelectorProps {
  columns: Column[]
  onColumnsChange: (columns: Column[]) => void
  storageKey: string
}

export function ColumnSelector({ columns, onColumnsChange, storageKey }: ColumnSelectorProps) {
  const toggleColumn = (columnId: string) => {
    const updatedColumns = columns.map((col) => (col.id === columnId ? { ...col, enabled: !col.enabled } : col))
    onColumnsChange(updatedColumns)

    // Save to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(updatedColumns))
    }
  }

  const resetColumns = () => {
    const resetColumns = columns.map((col) => ({ ...col, enabled: true }))
    onColumnsChange(resetColumns)

    // Clear from localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey)
    }
  }

  const enabledCount = columns.filter((col) => col.enabled).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="mr-2 h-4 w-4" />
          Columnas ({enabledCount}/{columns.length})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>Mostrar columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="space-y-2 p-2">
          {columns.map((column) => (
            <div key={column.id} className="flex items-center space-x-2">
              <Checkbox id={column.id} checked={column.enabled} onCheckedChange={() => toggleColumn(column.id)} />
              <Label htmlFor={column.id} className="text-sm font-normal cursor-pointer flex-1">
                {column.label}
              </Label>
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <div className="p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={resetColumns}>
            Restablecer
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
