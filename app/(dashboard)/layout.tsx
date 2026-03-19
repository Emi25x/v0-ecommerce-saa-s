"use client"

import type React from "react"
import { Suspense } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Topbar } from "@/components/layout/topbar"

/**
 * Dashboard layout — sidebar + topbar + scrollable main content.
 * All authenticated routes use this layout.
 */
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={null}>{children}</Suspense>
        </main>
      </div>
    </>
  )
}
