"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"

interface SidebarLinkProps {
  href: string
  label: string
  icon?: LucideIcon | React.ComponentType<{ className?: string }>
  /** Match mode: "exact" matches only this path, "prefix" matches any path starting with href */
  match?: "exact" | "prefix"
  badge?: number | null
  badgeColor?: string
}

export function SidebarLink({
  href,
  label,
  icon: Icon,
  match = "prefix",
  badge,
  badgeColor = "bg-blue-500",
}: SidebarLinkProps) {
  const pathname = usePathname()
  const isActive = match === "exact" ? pathname === href : pathname?.startsWith(href)

  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }`}
    >
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{label}</span>
      </div>
      {badge != null && badge > 0 && (
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full ${badgeColor} px-1.5 text-xs font-semibold text-white`}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
