import type React from "react"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

/**
 * Shared page header — sticky bar with title, optional description, and action slot.
 *
 * Usage:
 *   <PageHeader title="Inventario" description="Gestión de productos y stock">
 *     <Button>Importar</Button>
 *   </PageHeader>
 */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between gap-4 px-6">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {description && (
            <p className="truncate text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </header>
  )
}
