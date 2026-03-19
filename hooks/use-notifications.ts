"use client"

import { useState, useEffect, useCallback } from "react"

interface Notifications {
  orders?: number
  products?: number
  shipments?: number
  [key: string]: number | undefined
}

const POLL_INTERVAL_MS = 30_000

/**
 * Polls /api/notifications for badge counts.
 * Uses last-visit timestamps from localStorage to determine what's "new".
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notifications>({})

  const fetchNotifications = useCallback(async () => {
    try {
      const lastOrders = localStorage.getItem("lastVisit_orders") ?? ""
      const lastProducts = localStorage.getItem("lastVisit_products") ?? ""
      const lastShipments = localStorage.getItem("lastVisit_shipments") ?? ""

      const url = `/api/notifications?lastVisitOrders=${lastOrders}&lastVisitProducts=${lastProducts}&lastVisitShipments=${lastShipments}`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data)
    } catch {
      // Silent — non-critical
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  return notifications
}
