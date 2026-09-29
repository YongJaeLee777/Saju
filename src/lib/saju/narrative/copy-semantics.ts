import type { NarrativeSignalCode, NarrativeTemporalTheme } from './types'
import type { ChapterWritingBrief, WritingClaimRef } from './writing-brief'

export type CopyHeadlineAngle = 'statement' | 'identity' | 'behavior_reason' | 'contrast'
  | 'pattern' | 'self_question' | 'time_change' | 'exploratory_question'

/** Editorial paraphrases, never new claims. Source points and confidence remain local. */
export interface CopySemantics {
  readonly version: 'copy-semantics-v1'
  readonly source: WritingClaimRef
  readonly sourcePointCodes: readonly string[]
  readonly coreMeaning: string
  readonly behavioralFramings: readonly string[]
  readonly positiveFramings: readonly string[]
  readonly shadowFramings: readonly string[]
  readonly allowedHeadlineAngles: readonly CopyHeadlineAngle[]
  readonly forbiddenExtensions: readonly string[]
}

interface CopyPolicy {
  readonly positiveCode: string
  readonly shadowCode: string
  readonly positive: string
  readonly shadow: string
  readonly behavioral: boolean
  readonly angles: readonly CopyHeadlineAngle[]
  readonly forbidden: readonly string[]
}
const actionAngles: readonly CopyHeadlineAngle[] = ['statement', 'behavior_reason', 'self_question']

// Reviewed against GROUP_POLICY and buildNarrativeSignals. These describe candidates,
// not observed life events, habits, abilities, or measured psychological traits.
const preparation: CopyPolicy = {
  positiveCode: 'preparation_depth', shadowCode: 'extended_preparation',
  positive: '내용을 충분히 살펴보고 정리하려는 방향', shadow: '살펴보고 정리하는 과정이 길어질 가능성',
  behavioral: true, angles: actionAngles, forbidden: ['행동을 미룸', '결정을 못 함', '생각이 많음', '완벽주의'],
}
const responsibility: CopyPolicy = {
  positiveCode: 'responsibility_organization', shadowCode: 'rigid_role_expectations',
  positive: '맡은 역할과 기준을 정리하려는 방향', shadow: '역할에 대한 기준이 굳어질 가능성',
  behavioral: true, angles: actionAngles, forbidden: ['모든 일을 떠맡음', '남을 통제함', '번아웃'],
}
const resource: CopyPolicy = {
  positiveCode: 'deliberate_resource_choices', shadowCode: 'competing_resource_priorities',
  positive: '쓸 수 있는 것을 어디에 둘지 기준을 세우는 방향', shadow: '어디에 먼저 둘지 우선순위가 겹칠 가능성',
  behavioral: true, angles: actionAngles, forbidden: ['돈을 잘 범', '손해를 싫어함', '투자 능력'],
}
const autonomy: CopyPolicy = {
  positiveCode: 'autonomy_with_coordination', shadowCode: 'competing_preferences',
  positive: '자기 기준을 세우면서 주변의 기준과 맞추는 방향', shadow: '자기 기준과 다른 기준의 우선순위가 엇갈릴 가능성',
  behavioral: true, angles: actionAngles, forbidden: ['고집이 셈', '협업을 싫어함', '혼자 일해야 함'],
}
const expression: CopyPolicy = {
  positiveCode: 'productive_expression', shadowCode: 'dispersed_expression',
  positive: '표현하려는 것을 결과물로 옮기는 방향', shadow: '표현하려는 것이 여러 갈래로 흩어질 가능성',
  behavioral: true, angles: actionAngles, forbidden: ['말이 많음', '실행이 빠름', '창작 재능'],
}

function relationship(subject: string): CopyPolicy {
  return { positiveCode: 'relationship_mode_coordination', shadowCode: 'relationship_mode_friction',
    positive: `가까운 관계에서 ${subject}을 서로 맞추는 방향`,
    shadow: `관계에서 ${subject}을 맞추며 마찰이 생길 가능성`,
    behavioral: true, angles: actionAngles,
    forbidden: ['애착 유형', '배우자 성격', '연애에 서툼', '결혼이나 이별 사건'] }
}

export const COPY_SEMANTICS_POLICIES: Readonly<Record<NarrativeSignalCode, CopyPolicy>> = {
  preparation_analysis_focus: preparation,
  responsibility_structure_focus: responsibility,
  resource_realization_focus: resource,
  autonomy_coordination_focus: autonomy,
  expression_production_focus: expression,
  visible_expression_pattern: expression,
  visible_responsibility_pattern: responsibility,
  preparation_expression_tension: {
    positiveCode: 'coordination_of_coexisting_modes', shadowCode: 'competing_mode_priorities',
    positive: '충분히 살펴보는 쪽과 밖으로 표현하는 쪽을 함께 조율하는 방향',
    shadow: '살펴보는 쪽과 표현하는 쪽의 우선순위가 부딪힐 가능성',
    behavioral: true, angles: ['contrast', 'statement'], forbidden: ['실행을 두려워함', '평소와 압박 시 행동 단정'],
  },
  autonomy_structure_tension: {
    positiveCode: 'coordination_of_coexisting_modes', shadowCode: 'competing_mode_priorities',
    positive: '자기 기준과 맡은 역할의 기준을 함께 조율하는 방향',
    shadow: '자기 기준과 맡은 역할 사이에서 우선순위가 부딪힐 가능성',
    behavioral: true, angles: ['contrast', 'statement'], forbidden: ['권위에 반항함', '평소와 압박 시 행동 단정'],
  },
  surface_support_contrast: {
    positiveCode: 'surface_hidden_coordination', shadowCode: 'surface_hidden_demand_mismatch',
    positive: '겉으로 드러난 방식과 내부의 받침을 함께 고려하는 관점',
    shadow: '겉으로 드러난 요구와 내부의 받침이 어긋날 가능성',
    behavioral: false, angles: ['identity', 'contrast'],
    forbidden: ['속마음 단정', '혼자 있을 때의 행동', '감정을 숨김', '겉과 속이 다른 성격', '불안', '번아웃'],
  },
  relationship_expression_adjustment: relationship('표현 방식'),
  relationship_boundary_adjustment: relationship('각자의 기준'),
  relationship_responsibility_adjustment: relationship('맡은 역할'),
  recurring_coordination_tension: {
    positiveCode: 'repeated_coordination_review', shadowCode: 'repeated_coordination_friction',
    positive: '서로 맞춰야 하는 지점을 되짚어보는 방향',
    shadow: '같은 조율 지점이 부담이 될 가능성',
    behavioral: true, angles: ['pattern', 'statement'],
    forbidden: ['실제 문제가 반복됨', '충이나 형의 개수만큼 사건이 발생함'],
  },
}

const temporalSubjects: Record<NarrativeTemporalTheme, string> = {
  peers: '자기 기준과 주변의 기준을 맞추는 쪽', resource: '내용을 살펴보고 정리하는 쪽',
  output: '표현하려는 것을 밖으로 옮기는 쪽', wealth: '쓸 수 있는 것을 어디에 둘지 고르는 쪽',
  officer: '맡은 역할과 기준을 정리하는 쪽',
}

/** Only points actually allowed by the supplied WritingBrief can unlock copy. */
export function buildCopySemantics(brief: ChapterWritingBrief, source: WritingClaimRef): CopySemantics | undefined {
  if (!brief.evidenceSummary.length || !brief.sourceClaimRefs.some((ref) => ref.code === source.code
    && ref.planField === source.planField && ref.confidence === source.confidence)) return
  const positive = brief.allowedPoints.find((point) => point.source.kind === 'claim'
    && point.source.claimCode === source.code && point.source.field === 'positiveSide')
  if (!positive) return
  const shadow = brief.shadowPoints.find((point) => point.source.kind === 'claim'
    && point.source.claimCode === source.code && point.source.field === 'shadowSide')
  const policy = Object.entries(COPY_SEMANTICS_POLICIES).find(([code]) => code === source.code)?.[1]
  if (policy) {
    if (positive.code !== policy.positiveCode) return
    const hasShadow = shadow?.code === policy.shadowCode
    return { version: 'copy-semantics-v1', source, sourcePointCodes: [positive.code, ...(hasShadow ? [shadow.code] : [])],
      coreMeaning: policy.positive, behavioralFramings: policy.behavioral ? [policy.positive] : [],
      positiveFramings: [policy.positive], shadowFramings: hasShadow ? [policy.shadow] : [],
      allowedHeadlineAngles: policy.angles, forbiddenExtensions: policy.forbidden }
  }
  const period = brief.temporalScope?.claims.find((claim) => claim.code === source.code)
  const theme = period?.changeTheme ?? period?.activatedThemes[0]
  if (!period || !theme) return
  const suffix = period.phaseCode === 'daewoon_transition' ? 'transition' : 'phase'
  if (positive.code !== `${theme}_${suffix}_option`) return
  const direction = period.changeDirection === 'receded' ? '의 비중이 완화되는 흐름'
    : period.changeDirection === 'introduced' ? '이 새로 강조되는 흐름' : '이 상대적으로 강조되는 흐름'
  const coreMeaning = temporalSubjects[theme] + direction
  return { version: 'copy-semantics-v1', source, sourcePointCodes: [positive.code], coreMeaning,
    behavioralFramings: [], positiveFramings: [coreMeaning], shadowFramings: [],
    allowedHeadlineAngles: ['time_change', 'statement'],
    forbiddenExtensions: ['실제 과거 사건', '미래 사건 예언', '기간의 강조를 평생 성격으로 단정'] }
}
