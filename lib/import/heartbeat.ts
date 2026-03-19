/**
 * Heartbeat utility para prevenir timeouts en importaciones largas
 * Actualiza periódicamente el import_history para que el cliente sepa que el proceso sigue vivo
 */

import { createClient } from "@/lib/db/server"

export class ImportHeartbeat {
  private historyId: string | null
  private intervalId: NodeJS.Timeout | null = null
  private lastBeat: number = Date.now()
  private beatCount: number = 0

  constructor(historyId: string | null) {
    this.historyId = historyId
  }

  /**
   * Inicia el heartbeat cada 10 segundos
   */
  start() {
    if (!this.historyId) return

    this.intervalId = setInterval(async () => {
      try {
        const supabase = await createClient()
        this.beatCount++

        await supabase
          .from("import_history")
          .update({
            last_message: `Procesando... (heartbeat ${this.beatCount})`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", this.historyId!)

        this.lastBeat = Date.now()
        console.log(`[v0][HEARTBEAT] Beat #${this.beatCount} sent to history ${this.historyId}`)
      } catch (error) {
        console.error("[v0][HEARTBEAT] Error sending beat:", error)
      }
    }, 10000) // Cada 10 segundos
  }

  /**
   * Detiene el heartbeat
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log(`[v0][HEARTBEAT] Stopped after ${this.beatCount} beats`)
    }
  }

  /**
   * Obtiene el tiempo desde el último heartbeat
   */
  timeSinceLastBeat(): number {
    return Date.now() - this.lastBeat
  }
}
