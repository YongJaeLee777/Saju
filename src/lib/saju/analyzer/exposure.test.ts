import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import type { SajuResult } from '../types'
import { analyzeExposure } from './exposure'

const example = calculateSaju({
  birthDate: '1991-01-02', birthTime: '13:04', gender: 'female',
  calendarType: 'solar', isLeapMonth: false,
})

describe('analyzeExposure', () => {
  it('지장간 천간이 원국 천간에 있으면 투간으로 기록한다', () => {
    const analysis = analyzeExposure(example)
    expect(analysis.hasExposure).toBe(true)
    expect(analysis.findings).toContainEqual({
      sourcePillar: 'year', sourceBranch: '오', hiddenStem: '정', role: 'main', exposedPillars: ['hour'],
    })
  })

  it('대표 사주에서 임 지장간 투간과 시주 노출을 기록한다', () => {
    const analysis = analyzeExposure(example)
    expect(analysis.findings).toContainEqual({
      sourcePillar: 'day', sourceBranch: '신', hiddenStem: '임', role: 'middle', exposedPillars: ['day'],
    })
  })

  it('투간이 없으면 hasExposure가 false다', () => {
    const result: SajuResult = {
      ...example,
      year: { stem: '병', branch: '오', korean: '병오' },
      month: { stem: '갑', branch: '자', korean: '갑자' },
      day: { stem: '병', branch: '신', korean: '병신' },
      hour: { stem: '신', branch: '미', korean: '신미' },
      hiddenStems: {
        year: [{ stem: '정', element: '화' }, { stem: '기', element: '토' }], month: [{ stem: '계', element: '수' }],
        day: [{ stem: '경', element: '금' }, { stem: '임', element: '수' }, { stem: '무', element: '토' }], hour: [{ stem: '기', element: '토' }, { stem: '정', element: '화' }, { stem: '을', element: '목' }],
      },
    }
    expect(analyzeExposure(result)).toEqual({ hasExposure: false, findings: [] })
  })

  it('하나의 지장간이 여러 원국 천간에 드러나면 모두 기록한다', () => {
    const result = { ...example, year: { ...example.year, stem: '계' }, month: { ...example.month, stem: '계' } }
    const finding = analyzeExposure(result).findings.find(({ hiddenStem, sourcePillar }) => hiddenStem === '계' && sourcePillar === 'month')
    expect(finding?.exposedPillars).toEqual(['year', 'month'])
  })

  it('본기·중기·여기 역할을 기록한다', () => {
    const analysis = analyzeExposure(example)
    expect(analysis.findings.map(({ role }) => role)).toEqual(expect.arrayContaining(['main', 'middle']))
  })

  it('출생시간이 없으면 시주 천간과 시지 지장간을 제외한다', () => {
    const result = calculateSaju({ birthDate: '1991-01-02', birthTime: null, gender: 'female', calendarType: 'solar', isLeapMonth: false })
    expect(analyzeExposure(result).findings.every(({ sourcePillar, exposedPillars }) => sourcePillar !== 'hour' && !exposedPillars.includes('hour'))).toBe(true)
  })
})
