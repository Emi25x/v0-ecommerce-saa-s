"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { navigation, type NavSection, type NavItem, type NavSubgroup } from "@/lib/navigation"
import { useNotifications } from "@/hooks/use-notifications"
import { useLastVisits } from "@/hooks/use-last-visits"
import { SidebarSection } from "@/components/layout/sidebar-section"
import { SidebarLink } from "@/components/layout/sidebar-link"
import { Logo } from "@/components/layout/logo"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Home } from "lucide-react"

// ── Sidebar ──

export function AppSidebar() {
  const pathname = usePathname()
  const notifications = useNotifications()
  useLastVisits()

  const isActive = (path: string) => pathname === path

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="shrink-0 border-b border-sidebar-border p-4">
        <Logo />
      </div>

      {/* Navigation — scrollable */}
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1 p-4">
          {/* Dashboard link */}
          <Link
            href="/"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
              isActive("/")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Home className="h-5 w-5" />
            <span className="font-medium">Dashboard</span>
          </Link>

          {/* Sections from navigation data */}
          {navigation.map((section) => (
            <SidebarNavSection
              key={section.id}
              section={section}
              notifications={notifications}
              pathname={pathname}
            />
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}

// ── Section renderer ──

function SidebarNavSection({
  section,
  notifications,
  pathname,
}: {
  section: NavSection
  notifications: Record<string, number | undefined>
  pathname: string
}) {
  // Flat sections (e.g. Facturación)
  if (section.flat && section.flatHref) {
    const isActive = pathname === section.flatHref
    const Icon = section.icon
    return (
      <div className="mt-2">
        <Link
          href={section.flatHref}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
          <span className="font-medium">{section.label}</span>
        </Link>
        {section.children && (
          <div className="ml-8 mt-1 flex flex-col gap-1">
            {section.children.map((item) => (
              <NavItemLink key={item.href} item={item} notifications={notifications} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Collapsible sections
  return (
    <SidebarSection label={section.label} icon={section.icon}>
      {/* Primary items */}
      {section.items?.map((item) => (
        <NavItemLink key={item.href} item={item} notifications={notifications} />
      ))}

      {/* Subgroups with divider + label */}
      {section.subgroups?.map((sub) => (
        <SubgroupBlock key={sub.label} subgroup={sub} notifications={notifications} />
      ))}
    </SidebarSection>
  )
}

// ── Subgroup with divider + label ──

function SubgroupBlock({
  subgroup,
  notifications,
}: {
  subgroup: NavSubgroup
  notifications: Record<string, number | undefined>
}) {
  return (
    <>
      <div className="my-2 border-t border-sidebar-border" />
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
        {subgroup.label}
      </p>
      {subgroup.items.map((item) => (
        <NavItemLink key={item.href} item={item} notifications={notifications} />
      ))}
    </>
  )
}

// ── Nav item link with badge resolution ──

function NavItemLink({
  item,
  notifications,
}: {
  item: NavItem
  notifications: Record<string, number | undefined>
}) {
  const badge = item.badgeKey ? (notifications[item.badgeKey] ?? null) : null
  return (
    <SidebarLink
      href={item.href}
      label={item.label}
      icon={item.icon}
      match={item.match}
      badge={badge}
      badgeColor={item.badgeColor}
    />
  )
}
