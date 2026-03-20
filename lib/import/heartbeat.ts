/**
 * Heartbeat utility para prevenir timeouts en importaciones largas
 * Actualiza periódicamente el import_history para que el cliente sepa que el proceso sigue vivo
 */

import { createClient } from "@/lib/db/server"
import { createStructuredLogger } from "@/lib/logger"

const log = createStructuredLogger({})

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
        log.info("Heartbeat sent", "import.heartbeat", { beat: this.beatCount, history_id: this.historyId })
      } catch (error) {
        log.error("Error sending heartbeat", error, "import.heartbeat")
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
      log.info("Heartbeat stopped", "import.heartbeat", { total_beats: this.beatCount })
    }
  }

  /**
   * Obtiene el tiempo desde el último heartbeat
   */
  timeSinceLastBeat(): number {
    return Date.now() - this.lastBeat
  }
}
