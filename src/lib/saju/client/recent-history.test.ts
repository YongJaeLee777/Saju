import { describe, expect, it } from 'vitest'
import { clearRecentResults, readRecentResults, RECENT_HISTORY_KEY, recentResultUrl, removeRecentResult, saveRecentResult } from './recent-history'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear() { values.clear() },
    getItem(key) { return values.get(key) ?? null },
    key(index) { return [...values.keys()][index] ?? null },
    removeItem(key) { values.delete(key) },
    setItem(key, value) { values.set(key, value) },
  }
}

const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, '0')}`
const entry = (number: number) => ({
  profileId: id(number), birthDate: '1991-01-02', birthTime: null,
  gender: 'female', calendarType: 'solar', createdAt: '2026-09-29T00:00:00.000Z',
})

describe('recent result history', () => {
  it('saves only display fields and opens the existing result URL', () => {
    const storage = memoryStorage()
    saveRecentResult(storage, { ...entry(1), paid: true, entitlement: 'secret', snapshot: {}, tid: 'secret', order: 'secret', buyerId: 'secret' })
    expect(readRecentResults(storage)).toEqual([entry(1)])
    expect(JSON.parse(storage.getItem(RECENT_HISTORY_KEY)!)[0]).toEqual(entry(1))
    expect(recentResultUrl(id(1))).toBe(`/result/${id(1)}`)
    expect(recentResultUrl('../admin')).toBeNull()
  })

  it('deduplicates a profile and moves its newest save to the front', () => {
    const storage = memoryStorage()
    saveRecentResult(storage, entry(1))
    saveRecentResult(storage, entry(2))
    saveRecentResult(storage, { ...entry(1), birthTime: '13:04' })
    expect(readRecentResults(storage).map((item) => item.profileId)).toEqual([id(1), id(2)])
    expect(readRecentResults(storage)[0].birthTime).toBe('13:04')
  })

  it('keeps only the newest 20 entries', () => {
    const storage = memoryStorage()
    for (let number = 1; number <= 21; number++) saveRecentResult(storage, entry(number))
    expect(readRecentResults(storage)).toHaveLength(20)
    expect(readRecentResults(storage).map((item) => item.profileId)).not.toContain(id(1))
  })

  it('recovers malformed JSON and removes old invalid entries', () => {
    const storage = memoryStorage()
    storage.setItem(RECENT_HISTORY_KEY, '{broken')
    expect(readRecentResults(storage)).toEqual([])
    expect(storage.getItem(RECENT_HISTORY_KEY)).toBeNull()
    storage.setItem(RECENT_HISTORY_KEY, JSON.stringify([{ ...entry(1), profileId: 'invalid' }, { ...entry(2), paid: true }, entry(2)]))
    expect(readRecentResults(storage)).toEqual([entry(2)])
    expect(JSON.parse(storage.getItem(RECENT_HISTORY_KEY)!)).toEqual([entry(2)])
  })

  it('removes one entry or clears them all', () => {
    const storage = memoryStorage()
    saveRecentResult(storage, entry(1))
    saveRecentResult(storage, entry(2))
    removeRecentResult(storage, id(1))
    expect(readRecentResults(storage).map((item) => item.profileId)).toEqual([id(2)])
    clearRecentResults(storage)
    expect(readRecentResults(storage)).toEqual([])
  })
})
