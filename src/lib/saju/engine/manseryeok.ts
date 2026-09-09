import { calculateFourPillars, getHeavenlyStemElement } from 'manseryeok'
import type { EarthlyBranch } from 'manseryeok'

import type {
  SajuInput,
  SajuResult,
  HiddenStem,
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

function normalizeHiddenStems(branch: EarthlyBranch): HiddenStem[] {
  return hiddenStemsByBranch[branch].map((stem) => ({
    stem,
    element: getHeavenlyStemElement(stem),
  }))
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
