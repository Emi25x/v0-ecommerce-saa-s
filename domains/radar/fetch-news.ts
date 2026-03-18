import { createAdminClient } from "@/lib/db/admin"

// ── Adaptation signal patterns ───────────────────────────────────────────────
const ADAPTATION_PATTERNS = [
  /based on the (?:novel|book|bestsell\w+|memoir)/i,
  /adapted from (?:the )?(?:novel|book|bestsell\w+)/i,
  /adaptation of (?:the )?(?:novel|book)/i,
  /film adaptation of/i,
  /screen adaptation of/i,
  /(?:novel|book) by (.+?) (?:will be|is being|has been) adapt/i,
  /rights? (?:to|for) (?:the )?(?:novel|book)/i,
  /option(?:ed|ing) (?:the )?(?:novel|book|rights)/i,
]

const TITLE_EXTRACTORS = [
  /"([^"]{4,80})"/g,
  /\u2018([^\u2019]{4,80})\u2019/g,
  /\u201C([^\u201D]{4,80})\u201D/g,
]

const AUTHOR_EXTRACTOR = /\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g

interface ParsedArticle {
  is_adaptation: boolean
  confidence:    number
  detected_book: string | null
  detected_author: string | null
  project_type:  "series" | "film" | "unknown"
}

function analyzeContent(title: string, content: string): ParsedArticle {
  const text = `${title} ${content}`
  let matchCount = 0
  let confidence = 0

  for (const pat of ADAPTATION_PATTERNS) {
    if (pat.test(text)) {
      matchCount++
      confidence += 25
    }
  }

  if (matchCount === 0) return { is_adaptation: false, confidence: 0, detected_book: null, detected_author: null, project_type: "unknown" }

  confidence = Math.min(100, confidence)

  let detected_book: string | null = null
  for (const re of TITLE_EXTRACTORS) {
    re.lastIndex = 0
    const m = re.exec(text)
    if (m?.[1] && m[1].length > 3) { detected_book = m[1].trim(); break }
  }

  let detected_author: string | null = null
  AUTHOR_EXTRACTOR.lastIndex = 0
  const am = AUTHOR_EXTRACTOR.exec(text)
  if (am?.[1]) detected_author = am[1].trim()

  const project_type: "series" | "film" | "unknown" =
    /\b(series|tv show|limited series|mini.?series|streaming series)\b/i.test(text) ? "series" :
    /\b(film|movie|feature film|motion picture)\b/i.test(text) ? "film" : "unknown"

  return { is_adaptation: true, confidence, detected_book, detected_author, project_type }
}

// ── RSS Sources ──────────────────────────────────────────────────────────────
const RSS_SOURCES = [
  { name: "Variety",             url: "https://variety.com/feed" },
  { name: "Deadline",            url: "https://deadline.com/feed" },
  { name: "Hollywood Reporter",  url: "https://www.hollywoodreporter.com/feed" },
  { name: "ScreenRant",          url: "https://screenrant.com/feed" },
  { name: "Collider",            url: "https://collider.com/feed" },
]

function parseRssItems(xml: string): { title: string; url: string; published_at: string | null; content: string }[] {
  const items: { title: string; url: string; published_at: string | null; content: string }[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1]
    const title       = (/<title[^>]*><!\[CDATA\[(.+?)\]\]>/i.exec(block)   ?? /<title[^>]*>(.+?)<\/title>/i.exec(block))?.[1]   ?? ""
    const link        = (/<link>([^<]+)<\/link>/i.exec(block))?.[1] ?? (/<guid[^>]*>([^<]+)<\/guid>/i.exec(block))?.[1] ?? ""
    const pubDate     = (/<pubDate>([^<]+)<\/pubDate>/i.exec(block))?.[1] ?? null
    const description = (/<description><!\[CDATA\[([\s\S]+?)\]\]><\/description>/i.exec(block) ?? /<description>([\s\S]+?)<\/description>/i.exec(block))?.[1] ?? ""
    const encoded     = (/<content:encoded><!\[CDATA\[([\s\S]+?)\]\]><\/content:encoded>/i.exec(block))?.[1] ?? ""
    const rawContent  = (encoded || description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2000)
    if (title && link) items.push({ title: title.trim(), url: link.trim(), published_at: pubDate ? new Date(pubDate).toISOString() : null, content: rawContent.trim() })
  }
  return items
}

export interface FetchNewsResult {
  ok: boolean
  sources_checked: number
  total_new: number
  total_adaptations: number
  results: { source: string; fetched: number; new: number; adaptations: number; errors: string[] }[]
}

/**
 * Fetches RSS news feeds and detects book adaptations.
 * Extracted from /api/radar/news/fetch to allow direct invocation without self-fetch.
 */
export async function fetchRadarNews(opts?: { manual?: boolean }): Promise<FetchNewsResult> {
  const supabase = createAdminClient()

  const results: { source: string; fetched: number; new: number; adaptations: number; errors: string[] }[] = []
  let totalNew = 0
  let totalAdaptations = 0

  const { data: dbSources } = await supabase
    .from("editorial_radar_sources")
    .select("name, url")
    .eq("kind", "rss")
    .eq("active", true)

  const allSources = [
    ...RSS_SOURCES,
    ...(dbSources ?? []).filter(s => s.url).map(s => ({ name: s.name, url: s.url! })),
  ]

  for (const source of allSources) {
    const sourceResult = { source: source.name, fetched: 0, new: 0, adaptations: 0, errors: [] as string[] }

    try {
      const res = await fetch(source.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RadarBot/1.0)" },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const xml   = await res.text()
      const items = parseRssItems(xml)
      sourceResult.fetched = items.length

      for (const item of items) {
        const { data: existing } = await supabase
          .from("editorial_radar_news")
          .select("id")
          .eq("url", item.url)
          .maybeSingle()

        if (existing) continue

        const analysis = analyzeContent(item.title, item.content)

        const { data: inserted, error: insertErr } = await supabase
          .from("editorial_radar_news")
          .insert({
            title:           item.title,
            source:          source.name,
            url:             item.url,
            published_at:    item.published_at,
            content:         item.content,
            detected_book:   analysis.detected_book,
            detected_author: analysis.detected_author,
            project_type:    analysis.project_type,
            confidence_score: analysis.confidence,
            processed:       analysis.is_adaptation,
          })
          .select("id")
          .single()

        if (insertErr) { sourceResult.errors.push(insertErr.message); continue }
        sourceResult.new++
        totalNew++

        if (analysis.is_adaptation && analysis.confidence >= 50) {
          sourceResult.adaptations++
          totalAdaptations++

          const oppTitle = analysis.detected_book
            ? `Adaptación: "${analysis.detected_book}"${analysis.detected_author ? ` de ${analysis.detected_author}` : ""}`
            : `Adaptación detectada en ${source.name}: ${item.title.slice(0, 80)}`

          const { data: opp } = await supabase
            .from("editorial_radar_opportunities")
            .insert({
              opportunity_type: "adaptation",
              title:            oppTitle,
              description:      `Detectado en ${source.name}. Tipo de proyecto: ${analysis.project_type}. Confianza: ${analysis.confidence}%.\n\nTítulo artículo: ${item.title}\nURL: ${item.url}`,
              score:            Math.min(85, 40 + analysis.confidence * 0.45),
              confidence:       analysis.confidence >= 75 ? "high" : analysis.confidence >= 50 ? "medium" : "low",
              status:           "new",
              source_id:        null,
              metadata_json:    {
                detected_book:   analysis.detected_book,
                detected_author: analysis.detected_author,
                project_type:    analysis.project_type,
                news_source:     source.name,
                news_url:        item.url,
                published_at:    item.published_at,
              },
            })
            .select("id")
            .single()

          if (opp?.id && inserted?.id) {
            await supabase
              .from("editorial_radar_news")
              .update({ opportunity_id: opp.id })
              .eq("id", inserted.id)
          }
        }
      }
    } catch (e: any) {
      sourceResult.errors.push(String(e?.message ?? e))
    }

    results.push(sourceResult)

    await supabase
      .from("editorial_radar_sources")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("name", source.name)
      .eq("kind", "rss")
  }

  return {
    ok:                true,
    sources_checked:   allSources.length,
    total_new:         totalNew,
    total_adaptations: totalAdaptations,
    results,
  }
}
