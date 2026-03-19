"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/** Routes that track "last visit" for notification badges */
const TRACKED_ROUTES: Record<string, string> = {
  "/orders": "lastVisit_orders",
  "/products": "lastVisit_products",
  "/shipments": "lastVisit_shipments",
}

/**
 * Records the current timestamp in localStorage when the user visits
 * certain routes, so notification badges can show "new since last visit".
 */
export function useLastVisits() {
  const pathname = usePathname()

  useEffect(() => {
    const key = TRACKED_ROUTES[pathname]
    if (key) {
      localStorage.setItem(key, new Date().toISOString())
    }
  }, [pathname])
}
