import type { DaewoonResult, DaewoonStartAge, Gender, SajuInput, SajuResult } from '../types'
import { getDaewoonCalendar, getDaewoonPillarCycle } from '../engine/manseryeok'

const DAY_MS = 86_400_000
const KST_MS = 9 * 3_600_000

export function getDaewoonDirection(yearStem: string, gender: Gender): 'forward' | 'backward' {
  if (!['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'].includes(yearStem)) {
    throw new Error(`지원하지 않는 년간입니다: ${yearStem}`)
  }
  if (gender !== 'male' && gender !== 'female') throw new Error('잘못된 성별입니다.')
  const yang = ['갑', '병', '무', '경', '임'].includes(yearStem)
  return yang === (gender === 'male') ? 'forward' : 'backward'
}

function ageFromInterval(intervalMs: number): DaewoonStartAge {
  // 3 elapsed days = 1 age year = 12 age months = 360 age days.
  const years = Math.floor(intervalMs / (3 * DAY_MS))
  const remainingMs = intervalMs - years * 3 * DAY_MS
  const months = Math.floor(remainingMs / (DAY_MS / 4))
  const days = (remainingMs - months * DAY_MS / 4) / (DAY_MS / 120)
  return { years, months, days, preciseYears: intervalMs / (3 * DAY_MS) }
}

const isoKst = (instantMs: number) => new Date(instantMs + KST_MS).toISOString().replace('Z', '+09:00')

/** Calendar addition in fixed KST; clamp month-end, then add fractional days. */
export function addDaewoonAge(instantMs: number, age: Pick<DaewoonStartAge, 'years' | 'months' | 'days'>): number {
  const date = new Date(instantMs + KST_MS)
  const originalDay = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCFullYear(date.getUTCFullYear() + age.years)
  date.setUTCMonth(date.getUTCMonth() + age.months)
  const monthEnd = new Date(date.getTime())
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0)
  date.setUTCDate(Math.min(originalDay, monthEnd.getUTCDate()))
  return date.getTime() - KST_MS + Math.round(age.days * DAY_MS)
}

/** Input and chart must describe the same birth. Does not modify the natal result. */
export function analyzeDaewoon(input: SajuInput, chart: SajuResult): DaewoonResult {
  const calendar = getDaewoonCalendar(input)
  const result: DaewoonResult = {
    methodologyVersion: 'v1', direction: getDaewoonDirection(chart.year.stem, input.gender),
    monthPillar: { ...chart.month }, startPrecision: 'exact', timingUnavailableReason: null,
    referenceJeol: null, intervalMilliseconds: null, totalDays: null,
    startAge: null, startDateTime: null, cycles: [],
  }
  if (!input.birthTime) {
    result.startPrecision = 'date-only'
    result.timingUnavailableReason = 'birth-time-missing'
    // Direction/cycles follow the existing natal engine's missing-time convention.
    // Never use its placeholder hour to calculate a start age or instant.
  } else if (calendar.birthInstantMs === null) {
    result.startPrecision = 'unavailable'
    result.timingUnavailableReason = 'engine-instant-unavailable'
  }

  let firstStartMs: number | null = null
  if (calendar.birthInstantMs !== null) {
    const birthMs = calendar.birthInstantMs
    // Strictly after/before, including when birth coincides with the term exactly.
    const reference = result.direction === 'forward'
      ? calendar.jeols.find(({ instantMs }) => instantMs > birthMs)
      : [...calendar.jeols].reverse().find(({ instantMs }) => instantMs < birthMs)
    if (!reference) throw new Error('대운 기준 절입 시각을 찾을 수 없습니다.')
    const intervalMs = Math.abs(reference.instantMs - birthMs)
    result.referenceJeol = { name: reference.name, dateTime: isoKst(reference.instantMs) }
    result.intervalMilliseconds = intervalMs
    result.totalDays = intervalMs / DAY_MS
    result.startAge = ageFromInterval(intervalMs)
    firstStartMs = addDaewoonAge(birthMs, result.startAge)
    result.startDateTime = isoKst(firstStartMs)
  }

  const sexagenary = getDaewoonPillarCycle(chart.day.stem)
  const monthIndex = sexagenary.findIndex(({ stem, branch }) => stem === chart.month.stem && branch === chart.month.branch)
  if (monthIndex < 0) throw new Error('월주가 유효한 60갑자가 아닙니다.')
  const step = result.direction === 'forward' ? 1 : -1
  result.cycles = Array.from({ length: 10 }, (_, index) => ({
    ...sexagenary[(monthIndex + step * (index + 1) + 60) % 60],
    index: index + 1,
    startAge: result.startAge ? {
      ...result.startAge, years: result.startAge.years + index * 10,
      preciseYears: result.startAge.preciseYears + index * 10,
    } : null,
    // Every boundary is anchored to the first start, avoiding leap-day drift.
    startDateTime: firstStartMs === null ? null : isoKst(addDaewoonAge(firstStartMs, { years: index * 10, months: 0, days: 0 })),
    endDateTime: firstStartMs === null ? null : isoKst(addDaewoonAge(firstStartMs, { years: (index + 1) * 10, months: 0, days: 0 })),
  }))
  return result
}
