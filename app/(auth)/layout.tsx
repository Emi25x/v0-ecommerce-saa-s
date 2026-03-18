import type React from "react"

/**
 * Auth layout — no sidebar, centered content.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {children}
    </div>
  )
}
