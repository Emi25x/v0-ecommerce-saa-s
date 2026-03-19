"use client"

import { Breadcrumb } from "@/components/layout/breadcrumb"
import { UserMenu } from "@/components/layout/user-menu"

/**
 * Top bar for the dashboard — breadcrumb navigation + user menu.
 * Sits between sidebar and page content.
 */
export function Topbar() {
  return (
    <div className="flex h-12 items-center justify-between border-b border-border bg-background px-6">
      <Breadcrumb />
      <UserMenu />
    </div>
  )
}
