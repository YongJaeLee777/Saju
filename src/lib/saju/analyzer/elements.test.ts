import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { FiveElement, SajuResult } from '../types'
import { countSurfaceElements } from './elements'

const example = {
  birthDate: '1991-01-02',
  birthTime: '13:04',
  gender: 'female',
  calendarType: 'solar',
  isLeapMonth: false,
} as const

describe('countSurfaceElements', () => {
  it('경오·무자·임신·정미의 오행을 총 8개로 집계한다', () => {
    const counts = countSurfaceElements(calculateSaju(example).elements)
    expect(counts).toEqual({ 목: 0, 화: 2, 토: 2, 금: 2, 수: 2 })
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(8)
    expect(Object.values(counts).every(Number.isInteger)).toBe(true)
  })

  it.each([null, undefined, ''])('출생시간이 %s이면 시주를 제외하고 총 6개로 집계한다', (birthTime) => {
    const counts = countSurfaceElements(calculateSaju({ ...example, birthTime }).elements)
    expect(counts).toEqual({ 목: 0, 화: 1, 토: 1, 금: 2, 수: 2 })
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(6)
  })

  it.each<FiveElement>(['목', '화', '토', '금', '수'])('같은 %s 오행도 천간·지지마다 별도로 센다', (element) => {
    const pair = { stem: element, branch: element }
    const counts = countSurfaceElements({ year: pair, month: pair, day: pair, hour: pair })
    const expected = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 }
    expected[element] = 8
    expect(counts).toEqual(expected)
  })

  it('모든 기둥의 서로 다른 천간·지지를 집계한다', () => {
    const elements: SajuResult['elements'] = {
      year: { stem: '목', branch: '화' },
      month: { stem: '토', branch: '금' },
      day: { stem: '수', branch: '목' },
      hour: { stem: '목', branch: '토' },
    }
    expect(countSurfaceElements(elements)).toEqual({ 목: 3, 화: 1, 토: 2, 금: 1, 수: 1 })
  })

  it('입력을 변경하지 않고 호출 간 집계 상태를 공유하지 않는다', () => {
    const elements = calculateSaju(example).elements
    const original = structuredClone(elements)
    const first = countSurfaceElements(elements)
    first.목 = 99
    expect(countSurfaceElements(elements)).toEqual({ 목: 0, 화: 2, 토: 2, 금: 2, 수: 2 })
    expect(elements).toEqual(original)
  })
})
