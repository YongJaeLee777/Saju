import 'astro:env/server'
import { and, eq } from 'drizzle-orm'
import { reportSnapshots, sajuProfiles } from '../../../db/schema'
import type { SajuInput } from '../../saju/types'
import { loadEntitledReportSnapshot, loadEntitledReportSnapshotView } from './report-access'

export type DisplaySection = { headline: string; body: string; scopeLabel: string }
export type DisplayReport = { title: string; intro: string; closing: string; sections: DisplaySection[] }
export type PaidReportStatus = 'generating' | 'ready' | 'fallback_ready' | 'failed'
export type PaidReportView = { entitled: false; status: 'unpaid'; report: null }
  | { entitled: true; status: PaidReportStatus; report: DisplayReport | null }
type Access = Parameters<typeof loadEntitledReportSnapshot>[0]
type Snapshot = NonNullable<Awaited<ReturnType<typeof loadEntitledReportSnapshot>>>['snapshot']
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Project display text only; pending writing inputs and generation metadata stay server-side. */
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

function projectSnapshot(schemaVersion: string, json: string): PaidReportView {
  if (schemaVersion !== 'paid-narrative-v1') {
    return { entitled: true, status: 'generating', report: null }
  }
  try {
    const data: unknown = JSON.parse(json)
    if (!record(data) || !record(data.paidNarrative)) {
      return { entitled: true, status: 'failed', report: null }
    }
    const state = data.paidNarrative.state
    if (state === 'pending' || state === 'generating') {
      return { entitled: true, status: 'generating', report: null }
    }
    const report = parseReport(json)
    if (state === 'fallback_ready') {
      return { entitled: true, status: report ? 'fallback_ready' : 'failed', report }
    }
    if (state === 'complete') {
      const fallback = data.paidNarrative.mode === 'deterministic'
      return { entitled: true, status: report ? fallback ? 'fallback_ready' : 'ready' : 'failed', report }
    }
    return { entitled: true, status: 'failed', report: null }
  } catch { return { entitled: true, status: 'failed', report: null } }
}

const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, '0')).join('')

/** Authorized legacy snapshots are prepared lazily. The existing pending CAS
 * still owns the one AI attempt; a lost upgrade claim only observes its winner. */
async function prepareLegacyNarrative(context: Access, snapshot: Snapshot): Promise<Snapshot | null> {
  if (context.reportYear !== 2026) throw new Error('Unsupported narrative report year')
  const [profile] = await context.db.select({
    birthDate: sajuProfiles.birthDate, birthTime: sajuProfiles.birthTime,
    gender: sajuProfiles.gender, calendarType: sajuProfiles.calendarType,
    isLeapMonth: sajuProfiles.isLeapMonth,
  }).from(sajuProfiles).where(eq(sajuProfiles.id, context.profileId)).limit(1)
  if (!profile || (profile.gender !== 'male' && profile.gender !== 'female')
    || (profile.calendarType !== 'solar' && profile.calendarType !== 'lunar')) {
    throw new Error('Invalid narrative profile')
  }
  const input: SajuInput = { ...profile, gender: profile.gender, calendarType: profile.calendarType }
  const referenceAt = new Date()
  const { buildPaidNarrativeDraft } = await import('../../saju/server/paid-narrative-draft')
  const draft = buildPaidNarrativeDraft(input, referenceAt)
  const chapters = draft.report.paidNarrative.briefs.map((brief) => brief.chapter)
  if (chapters.length !== 12 || chapters.some((chapter, index) => chapter !== index + 1)) {
    throw new Error('Incomplete narrative brief')
  }
  const reportJson = JSON.stringify(draft.report)
  const prepared: Snapshot = {
    ...snapshot, reportJson, schemaVersion: 'paid-narrative-v1',
    reportHash: await hash(reportJson), methodologyVersionsJson: JSON.stringify(draft.report.methodologyVersions),
    referenceAt, inputHash: await hash(JSON.stringify(input)),
  }
  const claimed = await context.db.update(reportSnapshots).set({
    reportJson: prepared.reportJson, schemaVersion: prepared.schemaVersion,
    reportHash: prepared.reportHash, methodologyVersionsJson: prepared.methodologyVersionsJson,
    referenceAt: prepared.referenceAt, inputHash: prepared.inputHash,
  }).where(and(eq(reportSnapshots.id, snapshot.id), eq(reportSnapshots.schemaVersion, snapshot.schemaVersion),
    eq(reportSnapshots.reportHash, snapshot.reportHash), eq(reportSnapshots.reportJson, snapshot.reportJson)))
    .returning({ id: reportSnapshots.id })
  return claimed.length === 1 ? prepared : null
}

/** Read-only status/display lookup. It never starts generation. */
export async function loadPaidReport(context: Access): Promise<PaidReportView> {
  const loaded = await loadEntitledReportSnapshotView(context)
  if (!loaded) return { entitled: false, status: 'unpaid', report: null }
  return projectSnapshot(loaded.snapshot.schemaVersion, loaded.snapshot.reportJson)
}

/** The POST generation path. The snapshot CAS decides whether this request owns
 * the sole AI attempt; concurrent calls only observe the durable state. */
export async function generatePaidReport(context: Access): Promise<PaidReportView> {
  const loaded = await loadEntitledReportSnapshot(context)
  if (!loaded) return { entitled: false, status: 'unpaid', report: null }
  try {
    const snapshot = loaded.snapshot.schemaVersion === 'paid-narrative-v1'
      ? loaded.snapshot : await prepareLegacyNarrative(context, loaded.snapshot)
    if (!snapshot) return loadPaidReport(context)
    const { completePaidNarrativeSnapshot } = await import('../../saju/server/paid-narrative')
    const json = await completePaidNarrativeSnapshot(context, snapshot)
    if (json === snapshot.reportJson) {
      try {
        const original: unknown = JSON.parse(json)
        if (record(original) && record(original.paidNarrative) && original.paidNarrative.state === 'pending') {
          return { entitled: true, status: 'failed', report: null }
        }
      } catch { return { entitled: true, status: 'failed', report: null } }
    }
    return projectSnapshot(snapshot.schemaVersion, json)
  } catch {
    return { entitled: true, status: 'failed', report: null }
  }
}
