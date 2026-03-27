/**
 * Libral Order API Client
 *
 * Handles authentication and HTTP calls to Libral ERP for order create/delete.
 * Uses the same JWT auth as the stock import (domains/suppliers/libral/client.ts).
 *
 * NOTE: The exact endpoints for create/delete orders are not confirmed yet.
 * The base URL, auth, and db parameters are reused from the existing Libral client.
 * When endpoints are confirmed, update ENDPOINTS below.
 */

import { getLibralToken } from "@/domains/suppliers/libral/client"
import type { LibralCreateOrderPayload, LibralDeleteOrderPayload, LibralOrderResponse } from "./types"

// Base URL from existing Libral client
const LIBRAL_API_BASE = "https://libral.core.abazal.com/api"
const LIBRAL_DB = "GN6LIBRAL"

// Endpoints — update when confirmed by Libral
const ENDPOINTS = {
  createOrder: "/pedidos", // POST — to be confirmed
  deleteOrder: "/pedidos", // DELETE — to be confirmed
}

/**
 * Send a new order to Libral ERP
 */
export async function createLibralOrder(payload: LibralCreateOrderPayload): Promise<{
  success: boolean
  response: string
  error?: string
}> {
  try {
    const token = await getLibralToken()
    const url = `${LIBRAL_API_BASE}${ENDPOINTS.createOrder}?db=${LIBRAL_DB}`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await res.text()

    if (!res.ok) {
      return {
        success: false,
        response: responseText,
        error: `HTTP ${res.status}: ${responseText}`,
      }
    }

    // Libral responde "OK" o "KO"
    const isOk = responseText.trim().toUpperCase().startsWith("OK")
    return {
      success: isOk,
      response: responseText,
      error: isOk ? undefined : `Libral respondió: ${responseText}`,
    }
  } catch (err) {
    return {
      success: false,
      response: "",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Delete/cancel an order in Libral ERP by reference
 */
export async function deleteLibralOrder(payload: LibralDeleteOrderPayload): Promise<{
  success: boolean
  response: string
  error?: string
}> {
  try {
    const token = await getLibralToken()
    const url = `${LIBRAL_API_BASE}${ENDPOINTS.deleteOrder}?db=${LIBRAL_DB}`

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await res.text()

    if (!res.ok) {
      return {
        success: false,
        response: responseText,
        error: `HTTP ${res.status}: ${responseText}`,
      }
    }

    const isOk = responseText.trim().toUpperCase().startsWith("OK")
    return {
      success: isOk,
      response: responseText,
      error: isOk ? undefined : `Libral respondió: ${responseText}`,
    }
  } catch (err) {
    return {
      success: false,
      response: "",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
