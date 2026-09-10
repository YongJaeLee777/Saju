import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { SajuResult } from '../types'
import { analyzeBranchClashes } from './branch-clashes'

function fixture(year: string, month: string, day: string, hour: string | null = null): Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'> {
  const pillar = (branch: string) => ({ stem: '갑', branch, korean: `갑${branch}` })
  return {
    year: pillar(year), month: pillar(month), day: pillar(day),
    hour: hour === null ? { stem: null, branch: null, korean: null } : pillar(hour),
  }
}

describe('analyzeBranchClashes', () => {
  it.each([
    ['자', '오'], ['축', '미'], ['인', '신'], ['묘', '유'], ['진', '술'], ['사', '해'],
  ])('%s·%s 충을 양방향으로 탐지한다', (first, second) => {
    expect(analyzeBranchClashes(fixture(first, second, first))).toEqual([
      { pillars: ['year', 'month'], branches: [first, second] },
      { pillars: ['month', 'day'], branches: [second, first] },
    ])
  })

  it('충이 없으면 빈 배열을 반환한다', () => {
    expect(analyzeBranchClashes(fixture('자', '축', '인', '묘'))).toEqual([])
  })

  it('동일 지지는 충으로 기록하지 않는다', () => {
    expect(analyzeBranchClashes(fixture('자', '자', '자', '자'))).toEqual([])
  })

  it('서로 다른 복수 충과 일·시 위치 쌍을 기록한다', () => {
    expect(analyzeBranchClashes(fixture('자', '오', '축', '미'))).toEqual([
      { pillars: ['year', 'month'], branches: ['자', '오'] },
      { pillars: ['day', 'hour'], branches: ['축', '미'] },
    ])
  })

  it('반복 지지와 떨어진 위치의 충을 위치 쌍마다 중복 없이 기록한다', () => {
    expect(analyzeBranchClashes(fixture('자', '자', '오', '오'))).toEqual([
      { pillars: ['year', 'day'], branches: ['자', '오'] },
      { pillars: ['year', 'hour'], branches: ['자', '오'] },
      { pillars: ['month', 'day'], branches: ['자', '오'] },
      { pillars: ['month', 'hour'], branches: ['자', '오'] },
    ])
  })

  it('시간 미상에서는 시주 충만 제외하고 나머지 충은 유지한다', () => {
    expect(analyzeBranchClashes(fixture('자', '오', '축'))).toEqual([
      { pillars: ['year', 'month'], branches: ['자', '오'] },
    ])
  })

  it('실제 시간 미상 계산 결과에서 hour를 제외한다', () => {
    const result = calculateSaju({
      birthDate: '1991-01-02', birthTime: null, gender: 'female',
      calendarType: 'solar', isLeapMonth: false,
    })
    expect(result.hour.branch).toBeNull()
    expect(analyzeBranchClashes(result)).toEqual([
      { pillars: ['year', 'month'], branches: ['오', '자'] },
    ])
  })
})
