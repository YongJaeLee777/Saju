import { describe, expect, it } from 'vitest'
import { calculateSaju } from '../calculator'
import { buildAnalysisFacts } from './analysis-facts'
import { countHiddenElements, countSurfaceElements } from './elements'
import { getSeasonalContext } from './seasonal'
import { analyzeRoots } from './roots'
import { analyzeExposure } from './exposure'
import { analyzeStemCombinations } from './stem-combinations'
import { analyzeBranchClashes } from './branch-clashes'
import { analyzeBranchCombinations } from './branch-combinations'
import { analyzeBranchPunishments } from './branch-punishments'
import { analyzeBranchBreaks } from './branch-breaks'
import { analyzeBranchHarms } from './branch-harms'

const input = {
  birthDate: '1991-01-02', gender: 'female', calendarType: 'solar', isLeapMonth: false,
} as const

describe('buildAnalysisFacts integration', () => {
  it.each(['13:04', null])('출생시간 %s에서 모든 개별 분석 결과를 통합한다', (birthTime) => {
    const result = calculateSaju({ ...input, birthTime })
    const facts = buildAnalysisFacts(result)
    const surfaceCounts = countSurfaceElements(result.elements)
    const hiddenCounts = countHiddenElements(result.hiddenStems)
    expect(facts).toEqual({
      surfaceCounts,
      hiddenCounts,
      presence: Object.fromEntries(Object.entries(surfaceCounts).map(([element, count]) => [element, {
        surface: count > 0,
        hidden: Object.entries(hiddenCounts).some(([key, value]) => key === element && value > 0),
      }])),
      seasonal: getSeasonalContext(result),
      roots: analyzeRoots(result),
      exposure: analyzeExposure(result),
      stemCombinations: analyzeStemCombinations(result),
      branchClashes: analyzeBranchClashes(result),
      branchCombinations: analyzeBranchCombinations(result),
      branchPunishments: analyzeBranchPunishments(result),
      branchBreaks: analyzeBranchBreaks(result),
      branchHarms: analyzeBranchHarms(result),
    })
    expect(Object.values(facts.surfaceCounts).reduce((sum, count) => sum + count, 0)).toBe(birthTime === null ? 6 : 8)
  })

  it('시간 미상은 시주 관계를 제외하고 년·월 관계는 유지한다', () => {
    const known = buildAnalysisFacts(calculateSaju({ ...input, birthTime: '13:04' }))
    const unknown = buildAnalysisFacts(calculateSaju({ ...input, birthTime: null }))
    expect(known.stemCombinations).toEqual([{ pillars: ['day', 'hour'], stems: ['임', '정'] }])
    expect(known.branchHarms).toEqual([{ pillars: ['month', 'hour'], branches: ['자', '미'] }])
    expect(unknown.stemCombinations).toEqual([])
    expect(unknown.branchCombinations).toEqual([])
    expect(unknown.branchHarms).toEqual([])
    expect(unknown.branchClashes).toEqual([{ pillars: ['year', 'month'], branches: ['오', '자'] }])
    expect(unknown.roots.roots.every(({ pillar }) => pillar !== 'hour')).toBe(true)
    expect(unknown.exposure.findings.every(({ sourcePillar, exposedPillars }) => sourcePillar !== 'hour' && !exposedPillars.includes('hour'))).toBe(true)
    expect([...unknown.branchPunishments.findings, ...unknown.branchBreaks].every(({ pillars }) => !pillars.includes('hour'))).toBe(true)
  })
})
