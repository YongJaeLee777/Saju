import type { FiveElement, LuckFlow, LuckFlowFacts, LuckFlowPillar, LuckFlowSource, SajuResult, TenGod } from '../types'
import { classifyMonthCommandRelation } from './seasonal'

/** Supplied luck pillars must already have ten gods calculated for this natal day stem.
 * Repeated facts count only the supplied luck stems/branches, never natal counts.
 */
export function analyzeLuckFlow({ natal, daewoon, annualLuck }: {
  natal: { day: Pick<SajuResult['day'], 'stem'>; elements: { day: Pick<SajuResult['elements']['day'], 'stem'> } }
  daewoon?: LuckFlowPillar
  annualLuck?: LuckFlowPillar
}): LuckFlowFacts {
  const dayStem = natal.day.stem
  const dayElement = natal.elements.day.stem
  const facts: LuckFlowFacts = { dayStem, dayElement, repeatedElements: [], repeatedTenGods: [] }
  const elements = new Map<FiveElement, LuckFlowSource[]>()
  const tenGods = new Map<TenGod, LuckFlowSource[]>()

  const flow = (pillar: LuckFlowPillar, source: LuckFlowSource['source']): LuckFlow => {
    const { stem, branch, stemElement, branchElement, stemTenGod, branchTenGod } = pillar
    for (const position of ['stem', 'branch'] as const) {
      const origin: LuckFlowSource = { source, position }
      const element = position === 'stem' ? stemElement : branchElement
      const tenGod = position === 'stem' ? stemTenGod : branchTenGod
      elements.set(element, [...(elements.get(element) ?? []), origin])
      tenGods.set(tenGod, [...(tenGods.get(tenGod) ?? []), origin])
    }
    return {
      stem, branch, stemElement, branchElement, stemTenGod, branchTenGod,
      stemRelationToDayMaster: classifyMonthCommandRelation(dayElement, stemElement),
      branchRelationToDayMaster: classifyMonthCommandRelation(dayElement, branchElement),
    }
  }

  if (daewoon) facts.daewoon = flow(daewoon, 'daewoon')
  if (annualLuck) facts.annual = flow(annualLuck, 'annual')
  facts.repeatedElements = [...elements].filter(([, sources]) => sources.length >= 2)
    .map(([element, sources]) => ({ element, sources }))
  facts.repeatedTenGods = [...tenGods].filter(([, sources]) => sources.length >= 2)
    .map(([tenGod, sources]) => ({ tenGod, sources }))
  return facts
}
