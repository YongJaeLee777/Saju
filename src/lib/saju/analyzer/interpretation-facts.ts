import type {
  AnnualLuck, DaewoonCycle, InterpretationFacts, KeyPillarInteractionFacts,
  LuckFlowFacts, LuckInteractionFacts, SajuResult, StrengthAssessment,
} from '../types'

/** Caller supplies results for the same natal chart and selected luck periods.
 * Context uses natal identity and the supplied strength methodology version.
 * Nested results are shared unchanged; consumers should treat them as read-only.
 */
export function buildInterpretationFacts({ natal, strength, interactions, flow, keyPillars, daewoon, annualLuck }: {
  natal: SajuResult
  strength: StrengthAssessment
  interactions: LuckInteractionFacts
  flow: LuckFlowFacts
  keyPillars: KeyPillarInteractionFacts
  daewoon?: DaewoonCycle
  annualLuck?: AnnualLuck
}): InterpretationFacts {
  return {
    context: {
      dayStem: natal.day.stem,
      dayElement: natal.elements.day.stem,
      strengthLevel: strength.level,
      strengthConfidence: strength.confidence,
      methodologyVersion: strength.methodologyVersion,
    },
    luck: {
      ...(daewoon ? { daewoon } : {}),
      ...(annualLuck ? { annual: annualLuck } : {}),
    },
    interactions,
    flow: {
      ...(flow.daewoon ? { daewoon: flow.daewoon } : {}),
      ...(flow.annual ? { annual: flow.annual } : {}),
      repeatedElements: flow.repeatedElements,
      repeatedTenGods: flow.repeatedTenGods,
    },
    keyPillars,
  }
}
