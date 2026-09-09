import { describe, expect, it } from 'vitest'
import { calculateSaju } from './calculator'

const example = {
  birthDate: '1991-01-02', birthTime: '13:04',
  gender: 'female', calendarType: 'solar', isLeapMonth: false,
} as const

describe('normalized hidden stems', () => {
  it('경오·무자·임신·정미의 지장간 이름과 오행을 반환한다', () => {
    expect(calculateSaju(example).hiddenStems).toEqual({
      year: [{ stem: '정', element: '화' }, { stem: '기', element: '토' }],
      month: [{ stem: '계', element: '수' }],
      day: [{ stem: '경', element: '금' }, { stem: '임', element: '수' }, { stem: '무', element: '토' }],
      hour: [{ stem: '기', element: '토' }, { stem: '정', element: '화' }, { stem: '을', element: '목' }],
    })
  })

  it.each([null, undefined, ''])('시간이 %s이면 임시 자시의 지장간을 노출하지 않는다', (birthTime) => {
    const result = calculateSaju({ ...example, birthTime }).hiddenStems
    expect(result.hour).toBeNull()
    expect(result.year).toEqual([{ stem: '정', element: '화' }, { stem: '기', element: '토' }])
    expect(result.month).toEqual([{ stem: '계', element: '수' }])
    expect(result.day).toEqual([{ stem: '경', element: '금' }, { stem: '임', element: '수' }, { stem: '무', element: '토' }])
  })

  it('자시 정책으로 바뀐 일지의 지장간을 사용한다', () => {
    const result = calculateSaju({ ...example, birthTime: '23:30', dayBoundary: 'jasi' })
    expect(result.day.branch).toBe('유')
    expect(result.hiddenStems.day).toEqual([{ stem: '신', element: '금' }])
  })
})
