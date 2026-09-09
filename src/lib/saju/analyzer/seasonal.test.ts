import { describe, expect, it } from 'vitest'
import { getSeasonalContext } from './seasonal'
import type { FiveElement, SajuResult } from '../types'

function resultFor(monthBranch: string, dayStemElement: FiveElement, monthElement: FiveElement = '목'): Pick<SajuResult, 'month' | 'day' | 'elements'> {
  return {
    month: { stem: '갑', branch: monthBranch, korean: `갑${monthBranch}` },
    day: { stem: '갑', branch: '자', korean: '갑자' },
    elements: {
      year: { stem: '목', branch: '목' },
      month: { stem: monthElement, branch: monthElement },
      day: { stem: dayStemElement, branch: '목' },
      hour: null,
    },
  }
}

describe('getSeasonalContext', () => {
  it.each([
    ['인', '봄'], ['오', '여름'], ['유', '가을'], ['자', '겨울'],
  ] as const)('월지 %s를 %s으로 판정한다', (monthBranch, season) => {
    expect(getSeasonalContext(resultFor(monthBranch, '목'))).toEqual({
      monthBranch, monthElement: '목', season, dayStemElement: '목', relation: 'same',
    })
  })

  it('대표 사주 임신일·무자월에서 월지, 계절, 일간 오행을 반환한다', () => {
    const context = getSeasonalContext({
      month: { stem: '무', branch: '자', korean: '무자' },
      day: { stem: '임', branch: '신', korean: '임신' },
      elements: {
        year: { stem: '금', branch: '화' },
        month: { stem: '토', branch: '수' },
        day: { stem: '수', branch: '금' },
        hour: { stem: '화', branch: '토' },
      },
    })

    expect(context).toEqual({ monthBranch: '자', monthElement: '수', season: '겨울', dayStemElement: '수', relation: 'same' })
  })

  it('지원하지 않는 월지는 거부한다', () => {
    expect(() => getSeasonalContext(resultFor('?', '목'))).toThrow('지원하지 않는 월지')
  })

  it.each([
    ['화', '목', 'generatesMe'], ['목', '화', 'iGenerate'],
    ['토', '목', 'controlsMe'], ['목', '토', 'iControl'],
    ['목', '목', 'same'],
  ] as const)('일간 %s와 월지 오행 %s의 관계를 %s로 분류한다', (day, month, relation) => {
    expect(getSeasonalContext(resultFor('인', day, month)).relation).toBe(relation)
  })

  it('지원하지 않는 오행 값은 거부한다', () => {
    const result = resultFor('인', '목')
    Reflect.set(result.elements.month, 'branch', 'invalid')
    expect(() => getSeasonalContext(result)).toThrow('지원하지 않는 오행 관계')
  })
})
