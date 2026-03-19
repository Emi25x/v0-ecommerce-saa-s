/**
 * Helpers de formateo seguros que nunca crashean
 * Útil para evitar errores con datos undefined/null en UI
 */

export function fmtNumber(num?: number | null): string {
  if (num === null || num === undefined || isNaN(num)) return "0"
  try {
    return num.toLocaleString()
  } catch {
    return "0"
  }
}

export function fmtPercent(num?: number | null, decimals: number = 1): string {
  if (num === null || num === undefined || isNaN(num)) return "0.0"
  try {
    return num.toFixed(decimals)
  } catch {
    return "0.0"
  }
}

export function fmtDate(dateValue?: string | Date | null): string {
  if (!dateValue) return "—"
  try {
    const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue
    if (isNaN(date.getTime())) return "—"
    return date.toLocaleString()
  } catch {
    return "—"
  }
}

export function fmtSpeed(speedPerSec?: number | null): string {
  if (!speedPerSec || speedPerSec <= 0 || isNaN(speedPerSec)) return "—"
  try {
    return `${speedPerSec.toFixed(1)} items/s`
  } catch {
    return "—"
  }
}

export function fmtETA(etaSeconds?: number | null): string {
  if (!etaSeconds || etaSeconds <= 0 || isNaN(etaSeconds)) return "—"
  try {
    const minutes = Math.floor(etaSeconds / 60)
    const seconds = Math.floor(etaSeconds % 60)
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
  } catch {
    return "—"
  }
}
