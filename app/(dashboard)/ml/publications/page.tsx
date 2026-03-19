"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useMlPublications } from "@/hooks/use-ml-publications"
import { PublicationFilters } from "@/components/mercadolibre/publications/PublicationFilters"
import { PublicationsTable } from "@/components/mercadolibre/publications/PublicationsTable"
import { PublicationDialogs } from "@/components/mercadolibre/publications/PublicationDialogs"

export default function MLPublicationsPage() {
  const hook = useMlPublications()

  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 max-w-[1400px] mx-auto space-y-5">
        <PublicationFilters hook={hook} />
        <PublicationDialogs hook={hook} />
        <PublicationsTable hook={hook} />
      </div>
    </TooltipProvider>
  )
}
