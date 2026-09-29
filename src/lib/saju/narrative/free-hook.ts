import type { NarrativeClaim, NarrativePlan } from './types'

/** Internal trace only; the page projects text alone. */
export interface FreeHook {
  readonly text: string
  readonly sourceRefs: readonly string[]
  readonly confidence: 'strong' | 'medium' | 'fallback'
}

const fallback: FreeHook = {
  text: '나를 이해하는 단서는 작은 선택의 차이에서 시작돼요.', sourceRefs: [], confidence: 'fallback',
}
// Reviewed paraphrases of existing positiveSide codes, not inferred behavior.
const behaviors: Record<string, { positive: string; phrase: string }> = {
  preparation_analysis_focus: { positive: 'preparation_depth', phrase: '내용을 충분히 살펴보고 정리하려는' },
  responsibility_structure_focus: { positive: 'responsibility_organization', phrase: '맡은 역할과 기준을 정리하려는' },
  resource_realization_focus: { positive: 'deliberate_resource_choices', phrase: '쓸 수 있는 것을 어디에 둘지 기준을 세우려는' },
  autonomy_coordination_focus: { positive: 'autonomy_with_coordination', phrase: '자기 기준을 세우면서 주변의 기준과 맞추려는' },
  expression_production_focus: { positive: 'productive_expression', phrase: '표현하려는 것을 결과물로 옮기려는' },
  visible_expression_pattern: { positive: 'productive_expression', phrase: '표현하려는 것을 결과물로 옮기려는' },
  visible_responsibility_pattern: { positive: 'responsibility_organization', phrase: '맡은 역할과 기준을 정리하려는' },
  relationship_expression_adjustment: { positive: 'relationship_mode_coordination', phrase: '가까운 관계에서 표현 방식을 서로 맞추려는' },
  relationship_boundary_adjustment: { positive: 'relationship_mode_coordination', phrase: '가까운 관계에서 각자의 기준을 맞추려는' },
  relationship_responsibility_adjustment: { positive: 'relationship_mode_coordination', phrase: '가까운 관계에서 맡은 역할을 서로 맞추려는' },
  recurring_coordination_tension: { positive: 'repeated_coordination_review', phrase: '서로 맞춰야 하는 지점을 되짚어보려는' },
}
const tensions: Record<string, string> = {
  preparation_expression_tension: '충분히 살펴보는 쪽과 밖으로 표현하는 쪽이 함께 자리하고 있어요.',
  autonomy_structure_tension: '자기 기준과 맡은 역할의 기준이 함께 자리하고 있어요.',
}
const materials = {
  standing_tree: '곧게 선 나무', twining_vine: '뻗어 가는 덩굴', daylight: '낮의 빛', lamplight: '작은 등불',
  mountain_ground: '산의 땅', garden_soil: '가꾸는 흙', rough_metal: '다듬기 전의 금속',
  polished_metal: '다듬어진 금속', river_current: '이어지는 물줄기', rainwater: '내리는 빗물',
} as const
const environments = {
  support_reinforced: '받쳐 주는 환경이 겹친 모습', demand_reinforced: '여러 요구가 겹친 모습',
  support_counterposed: '받침과 계절의 방향이 다른 모습', demand_counterposed: '요구와 계절의 방향이 다른 모습',
} as const

export function buildFreeHook(plan?: NarrativePlan): FreeHook {
  if (!plan) return fallback
  const evidence = new Map(plan.evidence?.map((fact) => [fact.id, fact]) ?? [])
  const valid = (claim: NarrativeClaim) => (claim.confidence === 'strong' || claim.confidence === 'medium')
    && claim.evidence.length > 0 && claim.evidence.every((use) => evidence.has(use.factId))
    && (!claim.condition || evidence.get(claim.condition.factId)?.value === claim.condition.equals)
  const tension = plan.primaryTension
  if (tension && valid(tension) && tension.confidence === 'strong'
    && tension.positiveSide === 'coordination_of_coexisting_modes' && tensions[tension.code]) {
    return { text: tensions[tension.code], sourceRefs: [`claim:${tension.code}`], confidence: tension.confidence }
  }
  // Allocated claims first; stable field/allocation order breaks ties without counting
  // correlated evidence twice or altering the accepted confidence.
  const claims = [plan.relationship, plan.socialSelf, plan.work, plan.recurringPattern,
    plan.hiddenStrength, plan.privateSelf, plan.hook].flatMap((items) => items ?? [])
  for (const confidence of ['strong', 'medium'] as const) {
    const claim = claims.find((item) => item.confidence === confidence && valid(item)
      && behaviors[item.code]?.positive === item.positiveSide)
    if (claim) return { text: `${behaviors[claim.code].phrase} ${confidence === 'strong' ? '쪽에 무게가 실려 있어요.' : '편이에요.'}`,
      sourceRefs: [`claim:${claim.code}`], confidence }
  }
  const motif = plan.coreMetaphor
  if (motif?.mode === 'contextual' && motif.evidence.length && motif.evidence.every((use) => evidence.has(use.factId))) {
    return { text: `${materials[motif.materialCode]}의 이미지에 ${environments[motif.environmentCode]}이 담겨 있어요.`,
      sourceRefs: [`motif:${motif.code}`], confidence: motif.confidence }
  }
  return fallback
}
