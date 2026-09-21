import 'astro:env/server'
import { loadEntitledReportSnapshot } from './report-access'

type DisplaySection = { headline: string; body: string; scopeLabel: string }
type DisplayReport = { title: string; intro: string; closing: string; sections: DisplaySection[] }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Project stored display text only. Never regenerate an existing purchase. */
function parseReport(json: string): DisplayReport | null {
  try {
    const data: unknown = JSON.parse(json)
    if (!record(data) || typeof data.title !== 'string' || typeof data.intro !== 'string'
      || typeof data.closing !== 'string' || !Array.isArray(data.sections)) return null
    const sections: DisplaySection[] = []
    for (const section of data.sections) {
      if (!record(section) || typeof section.headline !== 'string' || typeof section.body !== 'string'
        || typeof section.scopeLabel !== 'string') return null
      sections.push({ headline: section.headline, body: section.body, scopeLabel: section.scopeLabel })
    }
    return { title: data.title, intro: data.intro, closing: data.closing, sections }
  } catch { return null }
}

export async function loadPaidReport(context: Parameters<typeof loadEntitledReportSnapshot>[0]) {
  const loaded = await loadEntitledReportSnapshot(context)
  if (!loaded) return { entitled: false, report: null }
  return { entitled: true, report: parseReport(loaded.snapshot.reportJson) }
}
