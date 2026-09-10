import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { SajuResult } from '../types'
import { analyzeBranchCombinations } from './branch-combinations'

function fixture(year: string, month: string, day: string, hour: string | null = null): Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'> {
  const pillar = (branch: string) => ({ stem: '갑', branch, korean: `갑${branch}` })
  return {
    year: pillar(year), month: pillar(month), day: pillar(day),
    hour: hour === null ? { stem: null, branch: null, korean: null } : pillar(hour),
  }
}

describe('analyzeBranchCombinations', () => {
  it.each([
    ['자', '축'], ['인', '해'], ['묘', '술'], ['진', '유'], ['사', '신'], ['오', '미'],
  ])('%s·%s 육합을 양방향으로 탐지한다', (first, second) => {
    expect(analyzeBranchCombinations(fixture(first, second, first))).toEqual([
      { pillars: ['year', 'month'], branches: [first, second] },
      { pillars: ['month', 'day'], branches: [second, first] },
    ])
  })

  it('육합이 없으면 빈 배열을 반환한다', () => {
    expect(analyzeBranchCombinations(fixture('자', '오', '인', '신'))).toEqual([])
  })

  it('동일 지지는 육합으로 기록하지 않는다', () => {
    expect(analyzeBranchCombinations(fixture('자', '자', '자', '자'))).toEqual([])
  })

  it('서로 다른 복수 합과 일·시 위치 쌍을 기록한다', () => {
    expect(analyzeBranchCombinations(fixture('자', '축', '인', '해'))).toEqual([
      { pillars: ['year', 'month'], branches: ['자', '축'] },
      { pillars: ['day', 'hour'], branches: ['인', '해'] },
    ])
  })

  it('반복 지지와 떨어진 위치의 합을 위치 쌍마다 중복 없이 기록한다', () => {
    expect(analyzeBranchCombinations(fixture('자', '자', '축', '축'))).toEqual([
      { pillars: ['year', 'day'], branches: ['자', '축'] },
      { pillars: ['year', 'hour'], branches: ['자', '축'] },
      { pillars: ['month', 'day'], branches: ['자', '축'] },
      { pillars: ['month', 'hour'], branches: ['자', '축'] },
    ])
  })

  it('시간 미상에서는 시주 합만 제외하고 나머지 합은 유지한다', () => {
    expect(analyzeBranchCombinations(fixture('자', '축', '인'))).toEqual([
      { pillars: ['year', 'month'], branches: ['자', '축'] },
    ])
  })

  it('실제 계산에서 출생시간이 없으면 시주 육합을 제외한다', () => {
    const input = { birthDate: '1991-01-02', gender: 'female', calendarType: 'solar', isLeapMonth: false } as const
    expect(analyzeBranchCombinations(calculateSaju({ ...input, birthTime: '13:04' }))).toEqual([
      { pillars: ['year', 'hour'], branches: ['오', '미'] },
    ])
    const unknownTime = calculateSaju({ ...input, birthTime: null })
    expect(unknownTime.hour.branch).toBeNull()
    expect(analyzeBranchCombinations(unknownTime)).toEqual([])
  })
})
