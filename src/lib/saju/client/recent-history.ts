import type { CalendarType, Gender } from '../types'

export const RECENT_HISTORY_KEY = 'saju:recent-results:v1'
const MAX_RESULTS = 20
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RecentResult {
  profileId: string
  birthDate: string
  birthTime: string | null
  gender: Gender
  calendarType: CalendarType
  createdAt: string
}

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function parseEntry(value: unknown): RecentResult | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (typeof entry.profileId !== 'string' || !PROFILE_ID.test(entry.profileId)) return null
  if (typeof entry.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.birthDate)) return null
  if (entry.birthTime !== null && (typeof entry.birthTime !== 'string' || !/^\d{2}:\d{2}$/.test(entry.birthTime))) return null
  if (entry.gender !== 'male' && entry.gender !== 'female') return null
  if (entry.calendarType !== 'solar' && entry.calendarType !== 'lunar') return null
  if (typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt))) return null
  return {
    profileId: entry.profileId,
    birthDate: entry.birthDate,
    birthTime: entry.birthTime,
    gender: entry.gender,
    calendarType: entry.calendarType,
    createdAt: entry.createdAt,
  }
}

export function readRecentResults(storage: HistoryStorage): RecentResult[] {
  try {
    const raw = storage.getItem(RECENT_HISTORY_KEY)
    if (raw === null) return []
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch {
      storage.removeItem(RECENT_HISTORY_KEY)
      return []
    }
    const seen = new Set<string>()
    const items = Array.isArray(parsed) ? parsed.flatMap((value) => {
      const entry = parseEntry(value)
      if (!entry || seen.has(entry.profileId)) return []
      seen.add(entry.profileId)
      return [entry]
    }).slice(0, MAX_RESULTS) : []
    if (JSON.stringify(items) !== raw) storage.setItem(RECENT_HISTORY_KEY, JSON.stringify(items))
    return items
  } catch {
    return []
  }
}

export function saveRecentResult(storage: HistoryStorage, value: unknown): void {
  const entry = parseEntry(value)
  if (!entry) return
  try {
    const items = readRecentResults(storage).filter((item) => item.profileId !== entry.profileId)
    storage.setItem(RECENT_HISTORY_KEY, JSON.stringify([entry, ...items].slice(0, MAX_RESULTS)))
  } catch {
    // Storage can be unavailable in private browsing; navigation must still work.
  }
}

export function removeRecentResult(storage: HistoryStorage, profileId: string): void {
  try {
    storage.setItem(RECENT_HISTORY_KEY, JSON.stringify(readRecentResults(storage).filter((item) => item.profileId !== profileId)))
  } catch {
    // Storage may be unavailable.
  }
}

export function clearRecentResults(storage: HistoryStorage): void {
  try { storage.removeItem(RECENT_HISTORY_KEY) } catch { /* Storage may be unavailable. */ }
}

export function recentResultUrl(profileId: string): string | null {
  return PROFILE_ID.test(profileId) ? `/result/${encodeURIComponent(profileId)}` : null
}
