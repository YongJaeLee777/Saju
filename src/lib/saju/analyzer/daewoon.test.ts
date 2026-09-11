import { describe, expect, it } from 'vitest'
import { calculateDaewoon, calculateSaju } from '../calculator'
import { getDaewoonCalendar, getDaewoonPillarCycle } from '../engine/manseryeok'
import type { SajuInput } from '../types'
import { addDaewoonAge, analyzeDaewoon, getDaewoonDirection } from './daewoon'

const example: SajuInput = {
  birthDate: '1991-01-02', birthTime: '13:04', gender: 'female',
  calendarType: 'solar', isLeapMonth: false, dayBoundary: 'midnight',
}

describe('Daewoon raw v1', () => {
  it('양간/음간과 남녀의 네 방향 조합을 적용한다', () => {
    for (const stem of ['갑', '병', '무', '경', '임']) {
      expect(getDaewoonDirection(stem, 'male')).toBe('forward')
      expect(getDaewoonDirection(stem, 'female')).toBe('backward')
    }
    for (const stem of ['을', '정', '기', '신', '계']) {
      expect(getDaewoonDirection(stem, 'male')).toBe('backward')
      expect(getDaewoonDirection(stem, 'female')).toBe('forward')
    }
  })

  it('대표 여성은 경년 역행, 무자 다음 역순 10개와 정밀 기운 나이를 반환한다', () => {
    const result = calculateDaewoon(example)
    expect(calculateSaju(example).year.stem).toBe('경')
    expect(result.direction).toBe('backward')
    expect(result.monthPillar.korean).toBe('무자')
    expect(result.cycles).toHaveLength(10)
    expect(result.cycles.slice(0, 5).map(({ korean }) => korean)).toEqual(['정해', '병술', '을유', '갑신', '계미'])
    expect(result.referenceJeol).toEqual({ name: '대설', dateTime: '1990-12-07T18:14:00.000+09:00' })
    expect(result.intervalMilliseconds).toBe(2_227_800_000)
    expect(result.totalDays).toBeCloseTo(25.78472222222222, 12)
    expect(result.startAge).toEqual({ years: 8, months: 7, days: 25 / 6, preciseYears: 2_227_800_000 / (3 * 86_400_000) })
    expect(result.startDateTime).toBe('1999-08-06T17:04:00.000+09:00')
    expect(result.startPrecision).toBe('exact')
    expect(result.cycles[0]).toMatchObject({
      stem: '정', branch: '해', stemElement: '화', branchElement: '수', stemTenGod: '정재', branchTenGod: '비견',
    })
    for (let index = 0; index < 10; index++) {
      const cycle = result.cycles[index]
      expect(cycle.index).toBe(index + 1)
      expect(cycle.startDateTime).toBe(`${1999 + index * 10}-08-06T17:04:00.000+09:00`)
      expect(cycle.endDateTime).toBe(`${2009 + index * 10}-08-06T17:04:00.000+09:00`)
      expect(cycle.startAge?.years).toBe(8 + index * 10)
      if (index < 9) expect(cycle.endDateTime).toBe(result.cycles[index + 1].startDateTime)
    }
  })

  it('순행은 다음 소한을 선택하고 무자를 제외한 기축부터 시작한다', () => {
    const result = calculateDaewoon({ ...example, gender: 'male' })
    expect(result.direction).toBe('forward')
    expect(result.referenceJeol?.name).toBe('소한')
    expect(result.cycles.slice(0, 3).map(({ korean }) => korean)).toEqual(['기축', '경인', '신묘'])
    expect(result.cycles.some(({ korean }) => korean === '무자')).toBe(false)
  })

  it('60갑자 끝과 시작을 양방향으로 순환한다', () => {
    const chart = calculateSaju(example)
    const forward = analyzeDaewoon({ ...example, gender: 'male' }, { ...chart, month: { stem: '계', branch: '해', korean: '계해' } })
    const backward = analyzeDaewoon(example, { ...chart, month: { stem: '갑', branch: '자', korean: '갑자' } })
    expect(forward.cycles[0].korean).toBe('갑자')
    expect(backward.cycles[0].korean).toBe('계해')
  })

  it('12절만 조회하고 시간차 1분도 나이 환산에 보존한다', () => {
    const calendar = getDaewoonCalendar(example)
    expect(calendar.jeols).toHaveLength(36)
    expect([...new Set(calendar.jeols.map(({ name }) => name))]).toEqual([
      '소한', '입춘', '경칩', '청명', '입하', '망종', '소서', '입추', '백로', '한로', '입동', '대설',
    ])
    const before = calculateDaewoon(example)
    const after = calculateDaewoon({ ...example, birthTime: '13:05' })
    expect(after.intervalMilliseconds! - before.intervalMilliseconds!).toBe(60_000)
    expect(after.startAge!.days - before.startAge!.days).toBeCloseTo(1 / 12, 12)
  })

  it('절입 정각은 제외하고 이전/다음 절을 선택한다', () => {
    // 경칩 1991-03-06 11:12, 신년: 여성 순행 / 남성 역행.
    const input: SajuInput = { ...example, birthDate: '1991-03-06', birthTime: '11:12' }
    expect(calculateDaewoon(input).referenceJeol?.name).toBe('청명')
    expect(calculateDaewoon({ ...input, gender: 'male' }).referenceJeol?.name).toBe('입춘')
    expect(calculateDaewoon({ ...input, birthTime: '11:11' }).referenceJeol?.name).toBe('경칩')
    expect(calculateDaewoon({ ...input, birthTime: '11:13', gender: 'male' }).referenceJeol?.name).toBe('경칩')
  })

  it('Gregorian 연·월·일 덧셈은 윤년·월말을 처리하며 고정 360/365일을 쓰지 않는다', () => {
    const birth = Date.parse('2020-02-29T13:04:00+09:00')
    expect(new Date(addDaewoonAge(birth, { years: 1, months: 0, days: 0 })).toISOString()).toBe('2021-02-28T04:04:00.000Z')
    expect(new Date(addDaewoonAge(birth, { years: 4, months: 0, days: 0 })).toISOString()).toBe('2024-02-29T04:04:00.000Z')
    expect(new Date(addDaewoonAge(Date.parse('2021-01-31T13:04:00+09:00'), { years: 0, months: 1, days: 0.5 })).toISOString())
      .toBe('2021-02-28T16:04:00.000Z')
  })

  it.each([null, undefined, ''])('출생시간 %s는 시작 나이/시각 없이 방향과 10개 대운을 반환한다', (birthTime) => {
    const input = { ...example, birthTime }
    const result = calculateDaewoon(input)
    expect(result).toMatchObject({ direction: 'backward', startPrecision: 'date-only', timingUnavailableReason: 'birth-time-missing', startAge: null, startDateTime: null, totalDays: null, intervalMilliseconds: null })
    expect(result.cycles).toHaveLength(10)
    expect(result.cycles.every(({ startAge, startDateTime, endDateTime }) => startAge === null && startDateTime === null && endDateTime === null)).toBe(true)
    expect(calculateSaju(input).hour.stem).toBeNull()
  })

  it('음력 윤달 입력은 동등한 양력의 대운과 동일하다', () => {
    expect(calculateDaewoon({ ...example, birthDate: '2020-04-01', calendarType: 'lunar', isLeapMonth: true }))
      .toEqual(calculateDaewoon({ ...example, birthDate: '2020-05-23' }))
    expect(calculateDaewoon({ ...example, isLeapMonth: true })).toEqual(calculateDaewoon(example))
  })

  it('과거 표준시 보정의 절대 시각이 비공개이면 unavailable, 방향과 대운은 유지한다', () => {
    const input = { ...example, trueSolarTime: { longitude: 126.978 } }
    const result = calculateDaewoon(input)
    expect(result).toMatchObject({ startPrecision: 'unavailable', timingUnavailableReason: 'engine-instant-unavailable', startAge: null, startDateTime: null })
    expect(result.cycles).toHaveLength(10)
    expect(result.cycles.every(({ startDateTime, endDateTime }) => startDateTime === null && endDateTime === null)).toBe(true)
    const safe = calculateDaewoon({ ...input, trueSolarTime: { ...input.trueSolarTime, applyHistoricalDst: false } })
    expect(safe.startPrecision).toBe('exact')
    expect(safe.startDateTime).toBe(calculateDaewoon(example).startDateTime)
  })

  it('기존 dayBoundary로 결정한 일간에 맞춰 십성을 계산하며 원국을 변경하지 않는다', () => {
    const input: SajuInput = { ...example, birthTime: '23:30', dayBoundary: 'jasi' }
    const chart = calculateSaju(input)
    const before = structuredClone(chart)
    const result = analyzeDaewoon(input, chart)
    expect(chart.day.stem).toBe('계')
    expect(result.cycles[0]).toMatchObject({ stemTenGod: '편재', branchTenGod: '겁재' })
    expect(chart).toEqual(before)
    expect(calculateSaju(input)).toEqual(before)
  })

  it('지지 십성은 각 지지의 명시적인 본기 천간 십성과 같다', () => {
    const mainStems: Record<string, string> = { 자: '계', 축: '기', 인: '갑', 묘: '을', 진: '무', 사: '병', 오: '정', 미: '기', 신: '경', 유: '신', 술: '무', 해: '임' }
    const cycle = getDaewoonPillarCycle('임')
    for (const pillar of cycle) {
      expect(pillar.branchTenGod).toBe(cycle.find(({ stem }) => stem === mainStems[pillar.branch])?.stemTenGod)
    }
  })
})
