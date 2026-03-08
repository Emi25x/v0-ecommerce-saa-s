import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const [oppsRes, signalsRes, gapsRes, adaptRes] = await Promise.all([
      supabase.from("editorial_radar_opportunities").select("opportunity_type, status, score, confidence, created_at"),
      supabase.from("editorial_radar_signals").select("signal_type, captured_at").gte("captured_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
      supabase.from("editorial_radar_gaps").select("gap_score, status, category"),
      supabase.from("editorial_radar_adaptations").select("status, priority"),
    ])

    const opps = oppsRes.data ?? []
    const signals = signalsRes.data ?? []
    const gaps = gapsRes.data ?? []
    const adaptations = adaptRes.data ?? []

    // counts by type
    const byType = opps.reduce((acc: Record<string, number>, o) => {
      acc[o.opportunity_type] = (acc[o.opportunity_type] ?? 0) + 1
      return acc
    }, {})

    const byStatus = opps.reduce((acc: Record<string, number>, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1
      return acc
    }, {})

    const bySignalType = signals.reduce((acc: Record<string, number>, s) => {
      acc[s.signal_type] = (acc[s.signal_type] ?? 0) + 1
      return acc
    }, {})

    // top opportunities by score
    const topOpps = [...opps]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 5)

    // top gaps
    const topGaps = [...gaps]
      .filter(g => g.status === "open")
      .sort((a, b) => (b.gap_score ?? 0) - (a.gap_score ?? 0))
      .slice(0, 5)

    return NextResponse.json({
      ok: true,
      totals: {
        opportunities:  opps.length,
        signals_7d:     signals.length,
        open_gaps:      gaps.filter(g => g.status === "open").length,
        adaptations:    adaptations.length,
        pending_review: byStatus["reviewing"] ?? 0,
        approved:       byStatus["approved"] ?? 0,
      },
      by_type:        byType,
      by_status:      byStatus,
      by_signal_type: bySignalType,
      top_opportunities: topOpps,
      top_gaps:          topGaps,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
