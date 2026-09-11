import {
  calculateFourPillars, getHeavenlyStemElement, getEarthlyBranchElement,
  getTenGod, getBranchTenGod, HEAVENLY_STEMS, EARTHLY_BRANCHES,
  getSolarTerm, lunarToSolar,
} from 'manseryeok'
import type { EarthlyBranch } from 'manseryeok'

import type {
  SajuInput,
  SajuResult,
  HiddenStem,
  DaewoonPillar,
  AnnualLuck,
} from '../types'

// manseryeok 2.0.0 exposes no full hidden-stem API.
// Mapping convention: lunar-javascript LunarUtil.ZHI_HIDE_GAN, main stem first.
// https://github.com/6tail/lunar-javascript/blob/master/lunar.js
// Membership/order only; no seasonal transition stems, weights, or strength scores.
const hiddenStemsByBranch: Record<EarthlyBranch, readonly HiddenStem['stem'][]> = {
  자: ['계'], 축: ['기', '계', '신'], 인: ['갑', '병', '무'], 묘: ['을'],
  진: ['무', '을', '계'], 사: ['병', '경', '무'], 오: ['정', '기'], 미: ['기', '정', '을'],
  신: ['경', '임', '무'], 유: ['신'], 술: ['무', '신', '정'], 해: ['임', '갑'],
}

/** Adapter-only calendar data for the separate raw Daewoon analyzer. */
export function getDaewoonCalendar(input: SajuInput) {
  const [year, month, day] = input.birthDate.split('-').map(Number)
  const solar = input.calendarType === 'lunar'
    ? lunarToSolar(year, month, day, input.isLeapMonth)
    : { year, month, day }
  const solarDate = `${String(solar.year).padStart(4, '0')}-${String(solar.month).padStart(2, '0')}-${String(solar.day).padStart(2, '0')}`
  // Same fixed KST instant as the engine when historical civil-time correction is off.
  // Its historical resolver is private: never silently substitute KST for that policy.
  const instantAvailable = !input.trueSolarTime || input.trueSolarTime.applyHistoricalDst === false
  const [hour, minute] = input.birthTime ? input.birthTime.split(':').map(Number) : []
  const birthInstantMs = input.birthTime && instantAvailable
    ? Date.parse(`${solarDate}T00:00:00+09:00`) + (hour * 60 + minute) * 60_000
    : null
  // Engine indices: 소한, 입춘, 경칩, 청명, 입하, 망종, 소서, 입추, 백로, 한로, 입동, 대설.
  // Fetch only the 12 jeol, and skip astronomical work when timing is unavailable.
  const jeolIndices = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
  const jeols = (birthInstantMs === null ? [] : [solar.year - 1, solar.year, solar.year + 1]).flatMap((termYear) =>
    jeolIndices.map((index) => {
      const { name, date } = getSolarTerm(termYear, index)
      return { name, instantMs: date.getTime() }
    }),
  ).sort((a, b) => a.instantMs - b.instantMs)
  return { solarDate, birthInstantMs, jeols }
}

export function getDaewoonPillarCycle(dayStem: string): DaewoonPillar[] {
  const dayMaster = HEAVENLY_STEMS.find((stem) => stem === dayStem)
  if (!dayMaster) throw new Error(`지원하지 않는 일간입니다: ${dayStem}`)
  return Array.from({ length: 60 }, (_, index) => {
    const stem = HEAVENLY_STEMS[index % 10]
    const branch = EARTHLY_BRANCHES[index % 12]
    return {
      stem, branch, korean: `${stem}${branch}`,
      stemElement: getHeavenlyStemElement(stem),
      branchElement: getEarthlyBranchElement(branch),
      stemTenGod: getTenGod(dayMaster, stem),
      branchTenGod: getBranchTenGod(dayMaster, branch),
    }
  })
}

function normalizeHiddenStems(branch: EarthlyBranch): HiddenStem[] {
  return hiddenStemsByBranch[branch].map((stem) => ({
    stem,
    element: getHeavenlyStemElement(stem),
  }))
}

export function calculateAnnualLuckWithManseryeok(year: number, dayStem: string): AnnualLuck {
  // Leave room for the engine's neighbouring-year lookup and next Lichun.
  if (!Number.isInteger(year) || year < 101 || year > 9998) {
    throw new RangeError('세운 연도는 101~9998 사이의 정수여야 합니다.')
  }
  const dayMaster = HEAVENLY_STEMS.find((stem) => stem === dayStem)
  if (!dayMaster) throw new Error(`지원하지 않는 일간입니다: ${dayStem}`)
  // March 1 is inside this Lichun year. Reuse the natal year-pillar engine;
  // no duplicated sexagenary formula or timezone conversion. Omit gender to skip Daewoon.
  const natal = calculateFourPillars({ year, month: 3, day: 1, hour: 0, minute: 0, dayBoundary: 'midnight' })
  const stem = natal.year.heavenlyStem
  const branch = natal.year.earthlyBranch
  return {
    year, stem, branch, korean: natal.yearString,
    stemElement: getHeavenlyStemElement(stem),
    branchElement: getEarthlyBranchElement(branch),
    stemTenGod: getTenGod(dayMaster, stem),
    branchTenGod: getBranchTenGod(dayMaster, branch),
    startDateTime: getSolarTerm(year, 2).date.toISOString(),
    endDateTime: getSolarTerm(year + 1, 2).date.toISOString(),
  }
}

export function calculateWithManseryeok(
  input: SajuInput,
): SajuResult {
  const [year, month, day] = input.birthDate
    .split('-')
    .map(Number)

  let hour = 0
  let minute = 0

  const hasBirthTime = Boolean(input.birthTime)

  if (input.birthTime) {
    const [parsedHour, parsedMinute] =
      input.birthTime.split(':').map(Number)

    hour = parsedHour
    minute = parsedMinute
  }

  const result = calculateFourPillars({
    year,
    month,
    day,
    hour,
    minute,
    isLunar: input.calendarType === 'lunar',
    isLeapMonth: input.calendarType === 'lunar' ? input.isLeapMonth : false,
    gender: input.gender,
    dayBoundary: input.dayBoundary ?? 'midnight',
    trueSolarTime: input.trueSolarTime,
  })

  const pillars = result.toObject()
  return {
    hiddenStems: {
      year: normalizeHiddenStems(result.year.earthlyBranch),
      month: normalizeHiddenStems(result.month.earthlyBranch),
      day: normalizeHiddenStems(result.day.earthlyBranch),
      hour: hasBirthTime ? normalizeHiddenStems(result.hour.earthlyBranch) : null,
    },
    elements: {
      year: { ...result.yearElement },
      month: { ...result.monthElement },
      day: { ...result.dayElement },
      hour: hasBirthTime ? { ...result.hourElement } : null,
    },
    tenGods: {
      year: { ...result.tenGods.year },
      month: { ...result.tenGods.month },
      day: { ...result.tenGods.day },
      hour: hasBirthTime ? { ...result.tenGods.hour } : null,
    },
    year: {
      stem: result.year.heavenlyStem,
      branch: result.year.earthlyBranch,
      korean: pillars.year,
    },

    month: {
      stem: result.month.heavenlyStem,
      branch: result.month.earthlyBranch,
      korean: pillars.month,
    },

    day: {
      stem: result.day.heavenlyStem,
      branch: result.day.earthlyBranch,
      korean: pillars.day,
    },

    hour: hasBirthTime
      ? {
          stem: result.hour.heavenlyStem,
          branch: result.hour.earthlyBranch,
          korean: pillars.hour,
        }
      : {
          stem: null,
          branch: null,
          korean: null,
        },
  }
}
