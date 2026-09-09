import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { SajuResult } from '../types'
import { analyzeRoots } from './roots'

const example = calculateSaju({
  birthDate: '1991-01-02', birthTime: '13:04', gender: 'female',
  calendarType: 'solar', isLeapMonth: false,
})

describe('analyzeRoots', () => {
  it('일간과 같은 천간이 일지 지장간에 있으면 통근으로 기록한다', () => {
    const analysis = analyzeRoots(example)
    expect(analysis.hasRoot).toBe(true)
    expect(analysis.roots).toContainEqual({ pillar: 'day', branch: '신', hiddenStem: '임', role: 'middle' })
  })

  it('같은 오행이어도 천간이 다르면 통근으로 보지 않는다', () => {
    const result = { ...example, day: { ...example.day, stem: '갑' } }
    expect(analyzeRoots(result).hasRoot).toBe(false)
  })

  it('여러 지지에 같은 일간 천간이 있으면 모두 기록한다', () => {
    const result: SajuResult = {
      ...example,
      day: { stem: '기', branch: '축', korean: '기축' },
      year: { stem: '갑', branch: '축', korean: '갑축' },
      month: { stem: '갑', branch: '미', korean: '갑미' },
      hour: { stem: '갑', branch: '오', korean: '갑오' },
      hiddenStems: {
        year: [{ stem: '기', element: '토' }, { stem: '계', element: '수' }, { stem: '신', element: '금' }],
        month: [{ stem: '기', element: '토' }, { stem: '정', element: '화' }, { stem: '을', element: '목' }],
        day: [{ stem: '기', element: '토' }, { stem: '계', element: '수' }, { stem: '신', element: '금' }],
        hour: [{ stem: '정', element: '화' }, { stem: '기', element: '토' }],
      },
    }
    expect(analyzeRoots(result).roots).toHaveLength(4)
  })

  it('본기·중기·여기 역할을 각각 기록한다', () => {
    const result: SajuResult = {
      ...example,
      day: { stem: '무', branch: '진', korean: '무진' },
      year: { stem: '갑', branch: '진', korean: '갑진' },
      month: { stem: '갑', branch: '인', korean: '갑인' },
      hour: { stem: '갑', branch: '신', korean: '갑신' },
      hiddenStems: {
        year: [{ stem: '무', element: '토' }, { stem: '을', element: '목' }, { stem: '계', element: '수' }],
        month: [{ stem: '갑', element: '목' }, { stem: '병', element: '화' }, { stem: '무', element: '토' }],
        day: [{ stem: '무', element: '토' }, { stem: '을', element: '목' }, { stem: '계', element: '수' }],
        hour: [{ stem: '경', element: '금' }, { stem: '임', element: '수' }, { stem: '무', element: '토' }],
      },
    }
    expect(analyzeRoots(result).roots.map(({ role }) => role)).toEqual(['residual', 'main', 'residual', 'main'])

    const middleResult: SajuResult = {
      ...result,
      day: { stem: '계', branch: '축', korean: '계축' },
      hiddenStems: {
        ...result.hiddenStems,
        year: [{ stem: '기', element: '토' }, { stem: '계', element: '수' }, { stem: '신', element: '금' }],
      },
    }
    expect(analyzeRoots(middleResult).roots.some(({ role }) => role === 'middle')).toBe(true)
  })

  it('출생시간이 없으면 시지 통근을 제외한다', () => {
    const result = calculateSaju({
      birthDate: '1991-01-02', birthTime: null, gender: 'female',
      calendarType: 'solar', isLeapMonth: false,
    })
    expect(analyzeRoots(result).roots.some(({ pillar }) => pillar === 'hour')).toBe(false)
  })
})
