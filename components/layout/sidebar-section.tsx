"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface SidebarSectionProps {
  label: string
  icon: LucideIcon | React.ComponentType<{ className?: string }>
  defaultExpanded?: boolean
  /** Optional badge text (e.g. "Beta") shown next to the section label */
  badge?: string
  children: React.ReactNode
}

export function SidebarSection({ label, icon: Icon, defaultExpanded = true, badge, children }: SidebarSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" />
          <span className="font-medium">{label}</span>
          {badge && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-amber-700">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && <div className="ml-8 mt-1 flex flex-col gap-1">{children}</div>}
    </div>
  )
}
