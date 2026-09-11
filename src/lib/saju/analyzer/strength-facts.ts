import type { AnalysisFacts, FiveElement, SajuResult, StrengthElementCounts, StrengthFacts } from '../types'

const GENERATES: Record<FiveElement, FiveElement> = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' }
const GENERATED_BY: Record<FiveElement, FiveElement> = { 목: '수', 화: '목', 토: '화', 금: '토', 수: '금' }
const CONTROLS: Record<FiveElement, FiveElement> = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' }
const CONTROLLED_BY: Record<FiveElement, FiveElement> = { 목: '금', 화: '수', 토: '목', 금: '화', 수: '토' }

/** 동일 원국의 raw data와 AnalysisFacts를 받는다. count는 일간을 포함한 기존 값 그대로다. */
export function buildStrengthFacts(
  result: Pick<SajuResult, 'day' | 'elements'>,
  facts: Pick<AnalysisFacts, 'surfaceCounts' | 'hiddenCounts' | 'seasonal' | 'roots'>,
): StrengthFacts {
  const dayElement = result.elements.day.stem
  const counts = (element: FiveElement): StrengthElementCounts => ({
    element, surface: facts.surfaceCounts[element], hidden: facts.hiddenCounts[element],
  })
  const roots: StrengthFacts['roots'] = {
    hasRoot: facts.roots.hasRoot,
    count: facts.roots.roots.length,
    byRole: { main: 0, middle: 0, residual: 0 },
    byPillar: { year: false, month: false, day: false, hour: false },
    findings: facts.roots.roots.map(({ pillar, role }) => ({ pillar, role })),
  }
  for (const root of facts.roots.roots) {
    roots.byRole[root.role] += 1
    roots.byPillar[root.pillar] = true
  }
  const { monthBranch, monthElement, relation } = facts.seasonal
  return {
    dayStem: result.day.stem,
    dayElement,
    seasonal: { monthBranch, monthElement, relation },
    roots,
    support: { sameElement: counts(dayElement), resourceElement: counts(GENERATED_BY[dayElement]) },
    drain: {
      outputElement: counts(GENERATES[dayElement]),
      wealthElement: counts(CONTROLS[dayElement]),
      officerElement: counts(CONTROLLED_BY[dayElement]),
    },
  }
}
