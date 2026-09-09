import { calculateFourPillars } from 'manseryeok'

import type {
  SajuInput,
  SajuResult,
} from '../types'

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

  isLeapMonth:
    input.calendarType === 'lunar'
      ? input.isLeapMonth
      : false,

  gender: input.gender,

  dayBoundary:
    input.dayBoundary ?? 'midnight',

  trueSolarTime: input.trueSolarTime,
})

  const pillars = result.toObject()
  return {
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