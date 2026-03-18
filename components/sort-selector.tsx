"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"

interface SortOption {
  value: string
  label: string
}

interface SortSelectorProps {
  options: SortOption[]
  value: string
  direction: "asc" | "desc"
  onSortChange: (value: string, direction: "asc" | "desc") => void
}

export function SortSelector({ options, value, direction, onSortChange }: SortSelectorProps) {
  const currentOption = options.find((opt) => opt.value === value)

  const toggleDirection = () => {
    onSortChange(value, direction === "asc" ? "desc" : "asc")
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 bg-transparent">
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Ordenar por: {currentOption?.label || "Fecha"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onSortChange(option.value, direction)}
              className={value === option.value ? "bg-accent" : ""}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-9 p-0 bg-transparent"
        onClick={toggleDirection}
        title={direction === "asc" ? "Ascendente" : "Descendente"}
      >
        {direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  )
}
