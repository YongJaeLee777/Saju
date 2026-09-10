import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { SajuResult } from '../types'
import { analyzeBranchHarms } from './branch-harms'

function fixture(year: string, month: string, day: string, hour: string | null = null): Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'> {
  const pillar = (branch: string) => ({ stem: '갑', branch, korean: `갑${branch}` })
  return {
    year: pillar(year), month: pillar(month), day: pillar(day),
    hour: hour === null ? { stem: null, branch: null, korean: null } : pillar(hour),
  }
}

describe('analyzeBranchHarms', () => {
  it.each([
    ['자', '미'], ['축', '오'], ['인', '사'], ['묘', '진'], ['신', '해'], ['유', '술'],
  ])('%s·%s 해를 양방향으로 탐지한다', (first, second) => {
    expect(analyzeBranchHarms(fixture(first, second, first))).toEqual([
      { pillars: ['year', 'month'], branches: [first, second] },
      { pillars: ['month', 'day'], branches: [second, first] },
    ])
  })

  it('해가 없으면 빈 배열을 반환한다', () => {
    expect(analyzeBranchHarms(fixture('자', '축', '인', '묘'))).toEqual([])
  })

  it('동일 지지는 해로 기록하지 않는다', () => {
    expect(analyzeBranchHarms(fixture('자', '자', '자', '자'))).toEqual([])
  })

  it('서로 다른 복수 해와 일·시 위치 쌍을 기록한다', () => {
    expect(analyzeBranchHarms(fixture('자', '미', '축', '오'))).toEqual([
      { pillars: ['year', 'month'], branches: ['자', '미'] },
      { pillars: ['day', 'hour'], branches: ['축', '오'] },
    ])
  })

  it('반복 지지와 떨어진 위치의 해를 위치 쌍마다 중복 없이 기록한다', () => {
    expect(analyzeBranchHarms(fixture('자', '자', '미', '미'))).toEqual([
      { pillars: ['year', 'day'], branches: ['자', '미'] },
      { pillars: ['year', 'hour'], branches: ['자', '미'] },
      { pillars: ['month', 'day'], branches: ['자', '미'] },
      { pillars: ['month', 'hour'], branches: ['자', '미'] },
    ])
  })

  it('시간 미상에서는 시주 해만 제외하고 나머지 해는 유지한다', () => {
    expect(analyzeBranchHarms(fixture('자', '미', '축'))).toEqual([
      { pillars: ['year', 'month'], branches: ['자', '미'] },
    ])
  })

  it('실제 계산에서 출생시간이 없으면 시주 해를 제외한다', () => {
    const input = { birthDate: '1991-01-02', gender: 'female', calendarType: 'solar', isLeapMonth: false } as const
    expect(analyzeBranchHarms(calculateSaju({ ...input, birthTime: '13:04' }))).toEqual([
      { pillars: ['month', 'hour'], branches: ['자', '미'] },
    ])
    const unknownTime = calculateSaju({ ...input, birthTime: null })
    expect(unknownTime.hour.branch).toBeNull()
    expect(analyzeBranchHarms(unknownTime)).toEqual([])
  })
})
