import { calculateSaju } from '../calculator'
import { getDaewoonPillarCycle } from '../engine/manseryeok'
import { buildAnalysisFacts } from '../analyzer/analysis-facts'
import { buildStrengthFacts } from '../analyzer/strength-facts'
import { assessStrength } from '../analyzer/strength'
import { analyzeLuckFlow } from '../analyzer/luck-flow'
import { analyzeLuckInteractions } from '../analyzer/luck-interactions'
import { analyzeKeyPillarInteractions } from '../analyzer/key-pillar-interactions'
import { buildInterpretationFacts } from '../analyzer/interpretation-facts'
import { buildNarrativeContext } from './context'
import type { HiddenStem, SajuResult } from '../types'

// Structural fixtures use normalized engine mappings and the existing analyzers.
// Arbitrary pillar arrangements are not claimed to correspond to a birth date.
const hidden = new Map<string, HiddenStem[]>()
for (let hour = 0; hour < 24; hour += 2) {
  const chart = calculateSaju({ birthDate: '2000-01-07', birthTime: `${String(hour).padStart(2, '0')}:00`,
    gender: 'female', calendarType: 'solar', isLeapMonth: false })
  if (chart.hour.branch && chart.hiddenStems.hour) hidden.set(chart.hour.branch, chart.hiddenStems.hour)
}

export function structuralContext(labels: readonly [string, string, string, string | null]) {
  const cycle = getDaewoonPillarCycle(labels[2].slice(0, 1))
  const pillar = (label: string) => {
    const found = cycle.find((entry) => entry.korean === label)
    if (!found) throw new Error(`Invalid fixture pillar: ${label}`)
    return found
  }
  const [year, month, day] = [pillar(labels[0]), pillar(labels[1]), pillar(labels[2])]
  const hour = labels[3] === null ? null : pillar(labels[3])
  const elements = (entry: typeof day) => ({ stem: entry.stemElement, branch: entry.branchElement })
  const gods = (entry: typeof day) => ({ stem: entry.stemTenGod, branch: entry.branchTenGod })
  const stems = (entry: typeof day) => {
    const found = hidden.get(entry.branch)
    if (!found) throw new Error(`Missing fixture hidden stems: ${entry.branch}`)
    return structuredClone(found)
  }
  const natal: SajuResult = {
    year, month, day, hour: hour ?? { stem: null, branch: null, korean: null },
    elements: { year: elements(year), month: elements(month), day: elements(day), hour: hour ? elements(hour) : null },
    tenGods: { year: gods(year), month: gods(month), day: { ...gods(day), stem: '일간' }, hour: hour ? gods(hour) : null },
    hiddenStems: { year: stems(year), month: stems(month), day: stems(day), hour: hour ? stems(hour) : null },
  }
  const analysis = buildAnalysisFacts(natal)
  const strengthFacts = buildStrengthFacts(natal, analysis)
  const strength = assessStrength(strengthFacts)
  const flow = analyzeLuckFlow({ natal })
  const interactions = analyzeLuckInteractions({ natal })
  const keyPillars = analyzeKeyPillarInteractions({ interactions })
  return buildNarrativeContext({
    natal, analysis, strengthFacts, strength, flow,
    interpretationFacts: buildInterpretationFacts({ natal, strength, flow, interactions, keyPillars }),
    hasBirthTime: hour !== null, referenceInstant: new Date('2026-09-13T00:00:00+09:00'),
    daewoonResult: { methodologyVersion: 'v1', direction: 'forward', monthPillar: month,
      startPrecision: 'unavailable', timingUnavailableReason: 'engine-instant-unavailable', referenceJeol: null,
      intervalMilliseconds: null, totalDays: null, startAge: null, startDateTime: null, cycles: [] },
  })
}
