"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function TestDeliver() {
  const [orderId, setOrderId] = useState("2000013158887752")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleDeliver = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`/api/mercadolibre/orders/${orderId}/deliver`, {
        method: "POST",
      })

      const data = await response.json()
      console.log("[v0] Response:", data)
      setResult({ status: response.status, data })
    } catch (error) {
      console.error("[v0] Error:", error)
      setResult({ error: String(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle>Test Marcar como Entregado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Order ID:</label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <Button onClick={handleDeliver} disabled={loading}>
            {loading ? "Procesando..." : "Marcar como Entregado"}
          </Button>

          {result && (
            <div className="mt-4 p-4 bg-gray-100 rounded">
              <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
