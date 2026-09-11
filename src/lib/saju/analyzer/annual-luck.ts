import { calculateAnnualLuckWithManseryeok } from '../engine/manseryeok'
import type { AnnualLuck } from '../types'

/** dayStem is the natal day stem already resolved by the caller's birth-time policy. */
export function calculateAnnualLuck(year: number, dayStem: string): AnnualLuck {
  return calculateAnnualLuckWithManseryeok(year, dayStem)
}

/** Ascending years starting at startYear; count is 1..120 to bound synchronous work. */
export function calculateAnnualLuckRange(startYear: number, count: number, dayStem: string): AnnualLuck[] {
  if (!Number.isInteger(count) || count < 1 || count > 120) {
    throw new RangeError('세운 개수는 1~120 사이의 정수여야 합니다.')
  }
  if (!Number.isInteger(startYear) || startYear < 101 || startYear + count - 1 > 9998) {
    throw new RangeError('세운 범위의 연도는 101~9998 사이여야 합니다.')
  }
  return Array.from({ length: count }, (_, index) => calculateAnnualLuck(startYear + index, dayStem))
}

/** Select by absolute instant, including Lichun itself in the new year. */
export function calculateAnnualLuckAt(instant: Date, dayStem: string): AnnualLuck {
  const instantMs = instant.getTime()
  if (!Number.isFinite(instantMs)) throw new RangeError('유효한 절대 시각이 필요합니다.')
  const utcYear = instant.getUTCFullYear()
  // The final supported term year still contains January of the following year.
  const candidate = calculateAnnualLuck(utcYear === 9999 ? 9998 : utcYear, dayStem)
  if (instantMs >= Date.parse(candidate.endDateTime)) throw new RangeError('지원하는 세운 기간 밖의 시각입니다.')
  return instantMs < Date.parse(candidate.startDateTime)
    ? calculateAnnualLuck(candidate.year - 1, dayStem)
    : candidate
}
