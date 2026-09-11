import { describe, expect, it } from 'vitest'
import type { FiveElement, RootAnalysis } from '../types'
import { calculateSaju } from '../calculator'
import { buildAnalysisFacts } from './analysis-facts'
import { buildStrengthFacts } from './strength-facts'

const input = { birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false } as const
const result = calculateSaju(input)
const facts = buildAnalysisFacts(result)

describe('buildStrengthFacts', () => {
  const mappings: [FiveElement, FiveElement, FiveElement, FiveElement, FiveElement][] = [
    ['목', '수', '화', '토', '금'], ['화', '목', '토', '금', '수'],
    ['토', '화', '금', '수', '목'], ['금', '토', '수', '목', '화'], ['수', '금', '목', '화', '토'],
  ]
  it.each(mappings)('%s의 same/resource/output/wealth/officer를 매핑하고 기존 count를 보존한다', (same, resource, output, wealth, officer) => {
    const raw = { ...result, elements: { ...result.elements, day: { ...result.elements.day, stem: same } } }
    const source = { ...facts, surfaceCounts: { 목: 1, 화: 2, 토: 3, 금: 4, 수: 5 }, hiddenCounts: { 목: 6, 화: 7, 토: 8, 금: 9, 수: 10 } }
    const strength = buildStrengthFacts(raw, source)
    const entries = [strength.support.sameElement, strength.support.resourceElement, strength.drain.outputElement, strength.drain.wealthElement, strength.drain.officerElement]
    expect(entries).toEqual([same, resource, output, wealth, officer].map((element) => ({ element, surface: source.surfaceCounts[element], hidden: source.hiddenCounts[element] })))
  })

  it('대표 사주의 사실만 반환하며 일간 자신을 surface에 포함한다', () => {
    expect(buildStrengthFacts(result, facts)).toEqual({
      dayStem: '임', dayElement: '수',
      seasonal: { monthBranch: '자', monthElement: '수', relation: 'same' },
      roots: { findings: [{ pillar: 'day', role: 'middle' }], hasRoot: true, count: 1, byRole: { main: 0, middle: 1, residual: 0 }, byPillar: { year: false, month: false, day: true, hour: false } },
      support: { sameElement: { element: '수', surface: 2, hidden: 2 }, resourceElement: { element: '금', surface: 2, hidden: 1 } },
      drain: { outputElement: { element: '목', surface: 0, hidden: 1 }, wealthElement: { element: '화', surface: 2, hidden: 2 }, officerElement: { element: '토', surface: 2, hidden: 3 } },
    })
  })

  it('root의 role과 위치를 집계하며 입력을 변경하지 않는다', () => {
    const roots: RootAnalysis = { hasRoot: true, roots: [
      { pillar: 'year', branch: '자', hiddenStem: '계', role: 'main' },
      { pillar: 'month', branch: '축', hiddenStem: '계', role: 'middle' },
      { pillar: 'day', branch: '진', hiddenStem: '계', role: 'main' },
      { pillar: 'hour', branch: '미', hiddenStem: '계', role: 'residual' },
    ] }
    const source = { ...facts, roots }
    const before = structuredClone(source)
    expect(buildStrengthFacts(result, source).roots).toEqual({ findings: roots.roots.map(({ pillar, role }) => ({ pillar, role })), hasRoot: true, count: 4, byRole: { main: 2, middle: 1, residual: 1 }, byPillar: { year: true, month: true, day: true, hour: true } })
    expect(source).toEqual(before)
  })

  it('통근이 없으면 모든 집계를 0/false로 보존한다', () => {
    expect(buildStrengthFacts(result, { ...facts, roots: { hasRoot: false, roots: [] } }).roots).toEqual({ findings: [], hasRoot: false, count: 0, byRole: { main: 0, middle: 0, residual: 0 }, byPillar: { year: false, month: false, day: false, hour: false } })
  })

  it('출생시간 미상은 기존 count의 시주 제외를 그대로 반영한다', () => {
    const raw = calculateSaju({ ...input, birthTime: null })
    const strength = buildStrengthFacts(raw, buildAnalysisFacts(raw))
    expect(strength.roots.byPillar.hour).toBe(false)
    expect(strength.support).toEqual({ sameElement: { element: '수', surface: 2, hidden: 2 }, resourceElement: { element: '금', surface: 2, hidden: 1 } })
    expect(strength.drain).toEqual({ outputElement: { element: '목', surface: 0, hidden: 0 }, wealthElement: { element: '화', surface: 1, hidden: 1 }, officerElement: { element: '토', surface: 1, hidden: 2 } })
  })

  it('seasonal relation을 변환 없이 보존한다', () => {
    const seasonal = { ...facts.seasonal, relation: 'controlsMe' as const }
    expect(buildStrengthFacts(result, { ...facts, seasonal }).seasonal).toEqual({ monthBranch: seasonal.monthBranch, monthElement: seasonal.monthElement, relation: 'controlsMe' })
  })
})
