import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { SajuResult } from '../types'
import { analyzeStemCombinations } from './stem-combinations'

function fixture(year: string, month: string, day: string, hour: string | null = null): Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'> {
  const pillar = (stem: string) => ({ stem, branch: '자', korean: `${stem}자` })
  return {
    year: pillar(year), month: pillar(month), day: pillar(day),
    hour: hour === null ? { stem: null, branch: null, korean: null } : pillar(hour),
  }
}

describe('analyzeStemCombinations', () => {
  it.each([
    ['갑', '기'], ['을', '경'], ['병', '신'], ['정', '임'], ['무', '계'],
  ])('%s·%s 합을 양방향으로 탐지한다', (first, second) => {
    expect(analyzeStemCombinations(fixture(first, second, first))).toEqual([
      { pillars: ['year', 'month'], stems: [first, second] },
      { pillars: ['month', 'day'], stems: [second, first] },
    ])
  })

  it('합이 아닌 서로 다른 천간은 제외한다', () => {
    expect(analyzeStemCombinations(fixture('갑', '을', '병', '정'))).toEqual([])
  })

  it('동일 천간끼리는 합으로 기록하지 않는다', () => {
    expect(analyzeStemCombinations(fixture('갑', '갑', '갑', '갑'))).toEqual([])
  })

  it('떨어진 위치와 반복 천간의 모든 합을 위치 쌍당 한 번 기록한다', () => {
    expect(analyzeStemCombinations(fixture('갑', '갑', '기', '기'))).toEqual([
      { pillars: ['year', 'day'], stems: ['갑', '기'] },
      { pillars: ['year', 'hour'], stems: ['갑', '기'] },
      { pillars: ['month', 'day'], stems: ['갑', '기'] },
      { pillars: ['month', 'hour'], stems: ['갑', '기'] },
    ])
  })

  it('일주와 시주의 합도 기록한다', () => {
    expect(analyzeStemCombinations(fixture('갑', '을', '정', '임'))).toEqual([
      { pillars: ['day', 'hour'], stems: ['정', '임'] },
    ])
  })

  it('시주가 없으면 년·월·일의 합만 기록한다', () => {
    expect(analyzeStemCombinations(fixture('갑', '기', '을'))).toEqual([
      { pillars: ['year', 'month'], stems: ['갑', '기'] },
    ])
  })

  it('실제 계산에서 출생시간이 없으면 시주 합을 제외한다', () => {
    const input = { birthDate: '1991-01-02', gender: 'female', calendarType: 'solar', isLeapMonth: false } as const
    expect(analyzeStemCombinations(calculateSaju({ ...input, birthTime: '13:04' }))).toEqual([
      { pillars: ['day', 'hour'], stems: ['임', '정'] },
    ])
    expect(analyzeStemCombinations(calculateSaju({ ...input, birthTime: null }))).toEqual([])
  })
})
