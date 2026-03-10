"use client"
import { useState } from "react"

// Página de diagnóstico temporal para ver exactamente qué devuelve ML en cada paso
// Acceder en /billing/debug
export default function BillingDebugPage() {
  const [orderId,    setOrderId]    = useState("")
  const [accountId,  setAccountId]  = useState("")
  const [result,     setResult]     = useState<any>(null)
  const [loading,    setLoading]    = useState(false)

  async function run() {
    setLoading(true)
    setResult(null)
    try {
      const r = await fetch(`/api/mercadolibre/debug-order?account_id=${accountId}&order_id=${orderId}`)
      const d = await r.json()
      setResult(d)
    } catch (e: any) {
      setResult({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  function statusBadge(status: number | null | undefined) {
    if (!status) return null
    return (
      <span className={`ml-2 text-xs px-2 py-0.5 rounded ${status === 200 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
        HTTP {status}
      </span>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">Debug: Datos fiscales ML</h1>
      <p className="text-muted-foreground mb-6">
        Ingresá el ID de una orden de ML para ver exactamente qué devuelve cada paso del flujo de billing_info.
      </p>

      <div className="flex gap-3 mb-6">
        <input
          className="border rounded px-3 py-2 bg-background flex-1"
          placeholder="Account ID (UUID)"
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2 bg-background flex-1"
          placeholder="Order ID (ej: 2000015173612194)"
          value={orderId}
          onChange={e => setOrderId(e.target.value)}
        />
        <button
          className="bg-primary text-primary-foreground px-4 py-2 rounded"
          onClick={run}
          disabled={loading || !orderId || !accountId}
        >
          {loading ? "Consultando..." : "Consultar"}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Paso 1: resultado de GET /orders/{id} */}
          <section className="border rounded p-4">
            <h2 className="font-bold mb-2">
              Paso 1 — GET /orders/{"{id}"}
              {statusBadge(result.order_status)}
            </h2>
            <p className="text-muted-foreground text-xs mb-1">buyer object (debe tener billing_info.id):</p>
            <pre className="bg-muted p-3 rounded overflow-auto text-xs">
              {JSON.stringify(result.order_buyer, null, 2)}
            </pre>
          </section>

          {/* billing_info.id extraído */}
          <section className="border rounded p-4">
            <h2 className="font-bold mb-2">billing_info.id extraído</h2>
            {result.billing_info_id
              ? <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded">{result.billing_info_id}</span>
              : <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded">NO encontrado — el comprador no tiene billing_info.id</span>
            }
          </section>

          {/* buyer.identification directo en la orden */}
          <section className="border rounded p-4">
            <h2 className="font-bold mb-2">buyer.identification (directo en la orden)</h2>
            {result.buyer_identification
              ? <pre className="bg-muted p-3 rounded overflow-auto text-xs">{JSON.stringify(result.buyer_identification, null, 2)}</pre>
              : <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">null — buyer no tiene identification en la orden</span>
            }
          </section>

          {/* Paso 2A: GET /orders/billing-info/MLA/{billing_info_id} */}
          <section className="border rounded p-4">
            <h2 className="font-bold mb-2">
              Paso 2A — GET /orders/billing-info/MLA/{"{billing_info_id}"}
              {statusBadge(result.billing_a_status)}
              {!result.billing_info_id && (
                <span className="ml-2 text-xs text-muted-foreground">(omitido — sin billing_info.id)</span>
              )}
            </h2>
            <p className="text-muted-foreground text-xs mb-1">Datos fiscales flat (respuesta primaria):</p>
            <pre className="bg-muted p-3 rounded overflow-auto text-xs">
              {result.billing_a_data !== null && result.billing_a_data !== undefined
                ? JSON.stringify(result.billing_a_data, null, 2)
                : "(sin datos)"}
            </pre>
          </section>

          {/* Paso 2B V2 */}
          <section className="border rounded p-4">
            <h2 className="font-bold mb-2">
              Paso 2B V2 — GET /orders/{"{id}"}/billing_info
              <span className="ml-1 text-xs text-muted-foreground">(x-version: 2)</span>
              {statusBadge(result.billing_b_v2_status)}
            </h2>
            <p className="text-muted-foreground text-xs mb-1">
              V2: buyer.billing_info.identification → DNI/CUIT
            </p>
            <pre className="bg-muted p-3 rounded overflow-auto text-xs">
              {result.billing_b_v2_data !== null && result.billing_b_v2_data !== undefined
                ? JSON.stringify(result.billing_b_v2_data, null, 2)
                : "(sin datos)"}
            </pre>
          </section>

          {/* Paso 2B V1 */}
          <section className="border rounded p-4">
            <h2 className="font-bold mb-2">
              Paso 2B V1 — GET /orders/{"{id}"}/billing_info
              <span className="ml-1 text-xs text-muted-foreground">(legacy, sin header)</span>
              {statusBadge(result.billing_b_v1_status)}
            </h2>
            <p className="text-muted-foreground text-xs mb-1">
              V1: billing_info.doc_type / doc_number + additional_info[]
            </p>
            <pre className="bg-muted p-3 rounded overflow-auto text-xs">
              {result.billing_b_v1_data !== null && result.billing_b_v1_data !== undefined
                ? JSON.stringify(result.billing_b_v1_data, null, 2)
                : "(sin datos)"}
            </pre>
          </section>
        </div>
      )}
    </div>
  )
}
