"use client"

import type React from "react"
import { Suspense } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"

/**
 * Dashboard layout — sidebar + main content area.
 * All authenticated routes use this layout.
 */
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppSidebar />
      <main className="flex-1">
        <Suspense fallback={null}>{children}</Suspense>
      </main>
    </>
  )
}
