import { describe, expect, it } from 'vitest'

import { calculateSaju } from './calculator'
import { getSolarTerm } from 'manseryeok'
import { getSolarTermsOfYear } from 'manseryeok'

describe('calculateSaju', () => {
  it('1991-01-02 13:04 여성 양력 사주팔자를 계산한다', () => {
    const result = calculateSaju({
      birthDate: '1991-01-02',
      birthTime: '13:04',
      gender: 'female',
      calendarType: 'solar',
      isLeapMonth: false,
    })

    expect(result.year.korean).toBe('경오')
    expect(result.month.korean).toBe('무자')
    expect(result.day.korean).toBe('임신')
    expect(result.hour.korean).toBe('정미')

    expect(result.year.stem).toBe('경')
    expect(result.year.branch).toBe('오')

    expect(result.month.stem).toBe('무')
    expect(result.month.branch).toBe('자')

    expect(result.day.stem).toBe('임')
    expect(result.day.branch).toBe('신')

    expect(result.hour.stem).toBe('정')
    expect(result.hour.branch).toBe('미')
  })

  it('출생시간이 없으면 시주는 null로 반환한다', () => {
    const result = calculateSaju({
      birthDate: '1991-01-02',
      birthTime: null,
      gender: 'female',
      calendarType: 'solar',
      isLeapMonth: false,
    })

    expect(result.year.korean).toBe('경오')
    expect(result.month.korean).toBe('무자')
    expect(result.day.korean).toBe('임신')

    expect(result.hour.stem).toBeNull()
    expect(result.hour.branch).toBeNull()
    expect(result.hour.korean).toBeNull()
  })

  it('같은 날짜라도 출생시간이 바뀌면 시주가 달라질 수 있다', () => {
    const morning = calculateSaju({
      birthDate: '1991-01-02',
      birthTime: '09:00',
      gender: 'female',
      calendarType: 'solar',
      isLeapMonth: false,
    })

    const afternoon = calculateSaju({
      birthDate: '1991-01-02',
      birthTime: '13:04',
      gender: 'female',
      calendarType: 'solar',
      isLeapMonth: false,
    })

    expect(morning.hour.korean).not.toBeNull()
    expect(afternoon.hour.korean).not.toBeNull()

    expect(morning.hour.korean)
      .not.toBe(afternoon.hour.korean)
  })

  it('양력 입력일 때 윤달 값은 계산에 영향을 주지 않는다', () => {
    const normal = calculateSaju({
      birthDate: '1991-01-02',
      birthTime: '13:04',
      gender: 'female',
      calendarType: 'solar',
      isLeapMonth: false,
    })

    const leap = calculateSaju({
      birthDate: '1991-01-02',
      birthTime: '13:04',
      gender: 'female',
      calendarType: 'solar',
      isLeapMonth: true,
    })

    expect(leap).toEqual(normal)
  })

  it('양력과 대응하는 음력 날짜는 같은 사주팔자를 반환한다', () => {
  const solar = calculateSaju({
    birthDate: '1992-10-24',
    birthTime: '05:30',
    gender: 'male',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  const lunar = calculateSaju({
    birthDate: '1992-09-29',
    birthTime: '05:30',
    gender: 'male',
    calendarType: 'lunar',
    isLeapMonth: false,
  })

  expect(lunar).toEqual(solar)
})

it('23시대 출생에서 dayBoundary 정책에 따라 일주가 달라질 수 있다', () => {
  const midnight = calculateSaju({
    birthDate: '1991-01-02',
    birthTime: '23:30',
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
    dayBoundary: 'midnight',
  })

  const jasi = calculateSaju({
    birthDate: '1991-01-02',
    birthTime: '23:30',
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
    dayBoundary: 'jasi',
  })

  expect(midnight.day.korean).not.toBe(jasi.day.korean)
})

it('자시 정책 3종의 결과를 확인한다', () => {
  const base = {
    birthDate: '1991-01-02',
    birthTime: '23:30',
    gender: 'female' as const,
    calendarType: 'solar' as const,
    isLeapMonth: false,
  }

  const midnight = calculateSaju({
    ...base,
    dayBoundary: 'midnight',
  })

  const jasi = calculateSaju({
    ...base,
    dayBoundary: 'jasi',
  })

  const splitJasi = calculateSaju({
    ...base,
    dayBoundary: 'splitJasi',
  })

  console.log({
    midnight: midnight.day.korean,
    jasi: jasi.day.korean,
    splitJasi: splitJasi.day.korean,
  })

  expect(midnight.day.korean).toBeTruthy()
  expect(jasi.day.korean).toBeTruthy()
  expect(splitJasi.day.korean).toBeTruthy()
})

it('splitJasi는 midnight와 일주는 같지만 시주는 달라질 수 있다', () => {
  const base = {
    birthDate: '1991-01-02',
    birthTime: '23:30',
    gender: 'female' as const,
    calendarType: 'solar' as const,
    isLeapMonth: false,
  }

  const midnight = calculateSaju({
    ...base,
    dayBoundary: 'midnight',
  })

  const splitJasi = calculateSaju({
    ...base,
    dayBoundary: 'splitJasi',
  })

  expect(midnight.day.korean)
    .toBe(splitJasi.day.korean)

  expect(midnight.hour.korean)
    .not.toBe(splitJasi.hour.korean)
})

it('입춘 경계 전후로 연주가 바뀐다', () => {
  const before = calculateSaju({
    birthDate: '1991-02-04',
    birthTime: '10:00',
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  const after = calculateSaju({
    birthDate: '1991-02-04',
    birthTime: '18:00',
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  expect(before.year.korean)
    .not.toBe(after.year.korean)

  console.log({
    before: before.year.korean,
    after: after.year.korean,
  })
})
  
it('입춘 절입 시각 전후로 연주가 바뀐다', () => {
  const lichun = getSolarTerm(1991, 2)

  console.log(
    '1991 입춘:',
    lichun.date.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
    }),
  )

  const beforeDate = new Date(
    lichun.date.getTime() - 60 * 1000,
  )

  const afterDate = new Date(
    lichun.date.getTime() + 60 * 1000,
  )

  const toKoreaInput = (date: Date) => {
    const formatter = new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      },
    )

    const parts = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    )

    return {
      birthDate:
        `${parts.year}-${parts.month}-${parts.day}`,
      birthTime:
        `${parts.hour}:${parts.minute}`,
    }
  }

  const beforeInput = toKoreaInput(beforeDate)
  const afterInput = toKoreaInput(afterDate)

  const before = calculateSaju({
    ...beforeInput,
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  const after = calculateSaju({
    ...afterInput,
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  console.log({
    beforeInput,
    beforeYear: before.year.korean,

    afterInput,
    afterYear: after.year.korean,
  })

  expect(before.year.korean)
    .not.toBe(after.year.korean)
})

it('절기 경계 전후로 월주가 바뀐다', () => {
  const terms = getSolarTermsOfYear(1991)

  console.log(
    terms.map((term) => ({
      name: term.name,
      date: term.date.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
      }),
    })),
  )

  // 우선 첫 실행에서 절기 목록을 보고
  // 입춘 이외의 "절(節)" 하나를 선택한다.
})

it('경칩 절입 시각 전후로 월주가 바뀐다', () => {
  const terms = getSolarTermsOfYear(1991)

  const gyeongchip = terms.find(
    (term) => term.name === '경칩',
  )

  if (!gyeongchip) {
    throw new Error('경칩 절기 정보를 찾지 못했습니다.')
  }

  const beforeDate = new Date(
    gyeongchip.date.getTime() - 60 * 1000,
  )

  const afterDate = new Date(
    gyeongchip.date.getTime() + 60 * 1000,
  )

  const toKoreaInput = (date: Date) => {
    const formatter = new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      },
    )

    const parts = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    )

    return {
      birthDate:
        `${parts.year}-${parts.month}-${parts.day}`,
      birthTime:
        `${parts.hour}:${parts.minute}`,
    }
  }

  const beforeInput = toKoreaInput(beforeDate)
  const afterInput = toKoreaInput(afterDate)

  const before = calculateSaju({
    ...beforeInput,
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  const after = calculateSaju({
    ...afterInput,
    gender: 'female',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  console.log({
    term: '경칩',
    beforeInput,
    beforeMonth: before.month.korean,
    afterInput,
    afterMonth: after.month.korean,
  })

  expect(before.month.korean)
    .not.toBe(after.month.korean)
})

it('윤달 음력 날짜가 대응하는 양력 날짜와 같은 사주팔자를 반환한다', () => {
  const lunarLeap = calculateSaju({
    birthDate: '2020-04-01',
    birthTime: '10:30',
    gender: 'male',
    calendarType: 'lunar',
    isLeapMonth: true,
  })

  const solar = calculateSaju({
    birthDate: '2020-05-23',
    birthTime: '10:30',
    gender: 'male',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  expect(lunarLeap).toEqual(solar)
})

it('같은 음력 4월 1일이라도 평달과 윤달은 다른 날짜로 계산된다', () => {
  const normalMonth = calculateSaju({
    birthDate: '2020-04-01',
    birthTime: '10:30',
    gender: 'male',
    calendarType: 'lunar',
    isLeapMonth: false,
  })

  const leapMonth = calculateSaju({
    birthDate: '2020-04-01',
    birthTime: '10:30',
    gender: 'male',
    calendarType: 'lunar',
    isLeapMonth: true,
  })

  expect(normalMonth).not.toEqual(leapMonth)

  console.log({
    normal: {
      year: normalMonth.year.korean,
      month: normalMonth.month.korean,
      day: normalMonth.day.korean,
      hour: normalMonth.hour.korean,
    },
    leap: {
      year: leapMonth.year.korean,
      month: leapMonth.month.korean,
      day: leapMonth.day.korean,
      hour: leapMonth.hour.korean,
    },
  })
})

it('진태양시 적용 시 시주가 달라질 수 있다', () => {
  const withoutCorrection = calculateSaju({
    birthDate: '1990-05-15',
    birthTime: '07:05',
    gender: 'male',
    calendarType: 'solar',
    isLeapMonth: false,
  })

  const withCorrection = calculateSaju({
    birthDate: '1990-05-15',
    birthTime: '07:05',
    gender: 'male',
    calendarType: 'solar',
    isLeapMonth: false,

    trueSolarTime: {
      // 서울
      longitude: 126.978,

      applyEquationOfTime: true,
      applyHistoricalDst: true,
    },
  })

  console.log({
    normal: {
      day: withoutCorrection.day.korean,
      hour: withoutCorrection.hour.korean,
    },

    trueSolarTime: {
      day: withCorrection.day.korean,
      hour: withCorrection.hour.korean,
    },
  })

  expect(withoutCorrection.hour.korean)
    .not.toBe(withCorrection.hour.korean)
})
})