import type { NarrativeSignalCode, NarrativeTemporalTheme } from './types'
import type {
  ChapterWritingBrief, ForbiddenInference, HeadlineIntent, WritingClaimRef, WritingEvidenceSummary,
  WritingMotifRef, WritingPoint, WritingTemporalScope, SceneDomain,
} from './writing-brief'

export type RenderedNarrativeSourceRef =
  | { readonly kind: 'claim'; readonly planField: WritingClaimRef['planField']; readonly code: string }
  | { readonly kind: 'motif'; readonly code: string }
  | { readonly kind: 'evidence'; readonly factId: string }
export interface RenderedNarrativeParagraph {
  readonly text: string
  readonly sourceRefs: readonly RenderedNarrativeSourceRef[]
}
export interface RenderedNarrativeChapter {
  readonly chapter: ChapterWritingBrief['chapter']
  readonly chapterMarkerKey: string
  readonly title: string
  readonly paragraphs: readonly RenderedNarrativeParagraph[]
  readonly sourceRefs: readonly RenderedNarrativeSourceRef[]
  readonly rendererVersion: 'deterministic-narrative-writer-v1'
}

const MATERIAL: Record<WritingMotifRef['materialCode'], string> = {
  standing_tree: '곧게 선 나무', twining_vine: '뻗어 가는 덩굴',
  daylight: '낮의 빛', lamplight: '작은 등불', mountain_ground: '산의 땅',
  garden_soil: '가꾸는 흙', rough_metal: '다듬기 전의 금속', polished_metal: '다듬어진 금속',
  river_current: '이어지는 물줄기', rainwater: '내리는 빗물',
}
const ENVIRONMENT: Record<string, string> = {
  support_reinforced: '받쳐 주는 방향이 겹친 구조', demand_reinforced: '요구되는 방향이 겹친 구조',
  support_counterposed: '받침과 계절의 방향이 달리 놓인 구조',
  demand_counterposed: '요구와 계절의 방향이 달리 놓인 구조',
}
const THEME: Record<NarrativeTemporalTheme, string> = {
  peers: '독립과 조율', resource: '준비와 분석', output: '표현과 생산',
  wealth: '자원과 선택', officer: '책임과 구조',
}
const TOPIC: Record<NarrativeSignalCode, string> = {
  autonomy_coordination_focus: '자기 기준과 조율', preparation_analysis_focus: '준비와 분석',
  expression_production_focus: '표현과 생산', resource_realization_focus: '자원 선택과 현실화',
  responsibility_structure_focus: '책임과 구조', preparation_expression_tension: '준비와 표현의 간격',
  autonomy_structure_tension: '자기 기준과 맡은 역할', visible_expression_pattern: '드러나는 표현',
  visible_responsibility_pattern: '드러나는 책임', surface_support_contrast: '겉의 방식과 내부의 받침',
  relationship_expression_adjustment: '관계 속 표현', relationship_boundary_adjustment: '관계의 거리',
  relationship_responsibility_adjustment: '관계의 역할', recurring_coordination_tension: '반복되는 조율',
}
const POSITIVE: Record<string, string> = {
  autonomy_with_coordination: '자기 기준을 세우면서도 함께 맞추는 방향',
  preparation_depth: '준비와 분석을 깊게 가져가는 방식',
  productive_expression: '표현을 결과물로 옮기는 방향',
  deliberate_resource_choices: '자원을 고르는 기준을 세우는 방식',
  responsibility_organization: '맡은 역할과 기준을 정리하는 방식',
  coordination_of_coexisting_modes: '서로 다른 두 방향을 함께 조율하는 방식',
  surface_hidden_coordination: '겉의 방식과 내부의 받침을 함께 살피는 관점',
  relationship_mode_coordination: '서로의 방식을 조율하는 방향',
  repeated_coordination_review: '되풀이되는 조율 지점을 살펴보는 방향',
  coordinated_environmental_direction: '기본 이미지와 주변 환경이 같은 방향에 놓인 구조',
  balancing_distinct_environmental_directions: '서로 다른 환경 방향을 함께 고려하는 구조',
}
const SHADOW: Record<string, string> = {
  competing_preferences: '자기 기준과 다른 사람의 기준이 맞물릴 때에는 선택의 우선순위가 엇갈릴 수 있어요.',
  extended_preparation: '준비가 길어지는 쪽으로도 기울 수 있어요.',
  dispersed_expression: '표현의 방향이 여러 갈래로 흩어질 수도 있어요.',
  competing_resource_priorities: '자원을 어디에 둘지 우선순위가 겹칠 수 있어요.',
  rigid_role_expectations: '역할의 기준이 지나치게 굳어질 수도 있어요.',
  competing_mode_priorities: '두 방향의 우선순위가 부딪힐 여지도 있어요.',
  surface_hidden_demand_mismatch: '겉으로 드러난 요구와 내부의 받침이 어긋날 여지도 있어요.',
  relationship_mode_friction: '서로의 방식을 맞추는 과정에서 마찰이 생길 여지도 있어요.',
  repeated_coordination_friction: '같은 조율 지점이 부담으로 느껴질 여지도 있어요.',
  directional_overconcentration: '같은 방향에 무게가 몰리는 면도 함께 살펴볼 수 있어요.',
  competing_environmental_demands: '서로 다른 환경의 요구가 동시에 놓이는 면도 있어요.',
}
const EVIDENCE_LABEL: Record<WritingEvidenceSummary['factKind'], string> = {
  pillar: '간지 자리', ten_god: '십성 배치', interaction: '자리 사이의 관계',
  flow: '운의 흐름', strength: '강약 분석값', other: '계산된 구조',
}
const UNSAFE: Partial<Record<ForbiddenInference, RegExp>> = {
  actual_past_event: /실제로.{0,24}(?:일이 있었|사건이 있었|발생했|일어났|경험했|선택했|결정했|일했)|겪었|결혼했|이직했|헤어졌/,
  mental_health_diagnosis: /우울증|불안장애|성격장애|정신질환/,
  personality_diagnosis: /(?:당신은|분명히).{0,24}성격(?:입니다|이에요)/,
  spouse_trait_assertion: /배우자는|미래의 배우자/,
  marriage_or_divorce_prediction: /결혼(?:할|합니다|하게)|이별(?:할|합니다|하게)|이혼(?:할|합니다|하게)/,
  job_change_prediction: /이직(?:할|합니다|하게)|퇴사(?:할|합니다|하게)/,
  wealth_event_prediction: /돈을 (?:벌|얻)|큰돈이 (?:들어|생겨)/,
  unverified_ability: /타고난 재능|특별한 능력|남다른 재능/,
  base_motif_personality: /(?:나무|덩굴|빛|등불|땅|흙|금속|물줄기|빗물).{0,30}(?:성격|사람입니다|사람이에요)/,
  relative_year_without_target_check: /올해|금년|이번 해/,
}

function claimRef(brief: ChapterWritingBrief, code: string): RenderedNarrativeSourceRef | undefined {
  const ref = brief.sourceClaimRefs.find((item) => item.code === code)
  return ref ? { kind: 'claim', planField: ref.planField, code: ref.code } : undefined
}

function temporal(brief: ChapterWritingBrief, code: string): WritingTemporalScope['claims'][number] | undefined {
  return brief.temporalScope?.claims.find((item) => item.code === code)
}

function hasDomain(brief: ChapterWritingBrief, code: string, domain: SceneDomain): boolean {
  return brief.suggestedSceneDomains.some((item) => item.claimCode === code && item.domains.includes(domain))
}

function topic(brief: ChapterWritingBrief): string | undefined {
  const first = brief.sourceClaimRefs.find((ref) => brief.coreMessage.sourceCodes.includes(ref.code))
  if (!first) return undefined
  if (Object.hasOwn(TOPIC, first.code)) return TOPIC[first.code as NarrativeSignalCode]
  const period = temporal(brief, first.code)
  const theme = period?.changeTheme ?? period?.activatedThemes[0]
  return theme ? THEME[theme] : undefined
}

function title(brief: ChapterWritingBrief): string | undefined {
  if (brief.coverageMode === 'neutral_bridge') {
    const neutral = ['이야기의 첫 장면', '이미지에서 시작하는 이야기', '사람들 사이에서 살펴볼 지점',
      '내 기준으로 다시 바라보기', '가까운 관계를 이야기할 때', '일의 장면으로 이어가기',
      '장점이 쓰이는 자리', '여러 방향을 함께 놓고 보면', '지나온 시간을 말할 때',
      '2026년을 살펴볼 때', '다음 시간을 생각할 때', '지금까지의 이야기를 묶으며'] as const
    return neutral[brief.chapter - 1]
  }
  const subject = topic(brief)
  const focusCode = brief.sourceClaimRefs.find((ref) => brief.coreMessage.sourceCodes.includes(ref.code))?.code
  const target = brief.temporalScope?.claims.find((item) => item.temporalRole === 'target')
  const targetYear = target?.annualTargetYear ?? brief.temporalScope?.annualTargetYear
  const intent: Record<HeadlineIntent, () => string | undefined> = {
    self_question: () => subject && `${subject}, 왜 자꾸 되돌아볼까요`,
    identity_frame: () => subject ? `${subject}을 함께 놓고 보면`
      : brief.motifRef ? `${MATERIAL[brief.motifRef.materialCode]}에서 시작하는 이야기` : undefined,
    visible_pattern: () => brief.coverageMode === 'secondary' && subject
      ? `사람들 사이에서 살펴볼 ${subject}` : focusCode === 'visible_expression_pattern'
      ? '표현이 밖으로 드러나는 방식' : focusCode === 'visible_responsibility_pattern'
        ? '책임이 밖으로 드러나는 방식' : subject && `${subject}, 바깥에서 보이는 방식`,
    inner_processing: () => brief.coverageMode === 'secondary' && subject
      ? `내 기준으로 다시 보는 ${subject}` : subject === TOPIC.surface_support_contrast
      ? '겉으로 드러난 것과 내부의 받침' : subject && `안쪽에서 살피는 ${subject}`,
    relationship_adjustment: () => subject && (brief.coverageMode === 'secondary'
      ? `가까운 관계에서 고려할 ${subject}` : `${subject}, 가까운 사이의 조율`),
    work_pattern: () => subject && `일에서 드러나는 ${subject}`,
    strength_in_use: () => subject && `${subject}, 잘 사용할 때의 장점`,
    hidden_pattern: () => subject && (brief.coverageMode === 'secondary'
      ? `${subject}이 함께 작동할 때` : `${subject}을 돌아보면`),
    past_direction: () => subject && `지나온 흐름에 놓였던 ${subject}`,
    current_change: () => subject && (targetYear ? `${targetYear}년에 함께 살필 ${subject}` : `지금 이어지는 ${subject}`),
    future_direction: () => subject && `다음 흐름에서 달라지는 ${subject}`,
    synthesis: () => subject ? `다시 놓고 보는 ${subject}`
      : brief.motifRef ? `${MATERIAL[brief.motifRef.materialCode]} 이미지를 다시 떠올리며` : undefined,
  }
  return intent[brief.headlineIntent]()
}

/** Title vocabulary only; does not render or expose a paid paragraph. */
export function describeWritingBriefTitle(brief: ChapterWritingBrief): string | undefined {
  return title(brief)
}

function pointSentence(brief: ChapterWritingBrief, point: WritingPoint, shadow: boolean, ordinal = 0): string | undefined {
  if (point.source.kind === 'contextual-motif') {
    if (brief.motifRef?.mode !== 'contextual' || brief.motifRef.code !== point.source.motifCode) return undefined
    if (shadow) return SHADOW[point.code]
    const phrase = POSITIVE[point.code]
    return phrase ? `${phrase}로 읽을 수 있어요.` : undefined
  }
  if (!claimRef(brief, point.source.claimCode)) return undefined
  if (shadow && point.source.field !== 'shadowSide') return undefined
  if (!shadow && point.source.field === 'shadowSide') return undefined
  const period = temporal(brief, point.source.claimCode)
  if (period) {
    const theme = period.changeTheme ?? period.activatedThemes[0]
    if (!theme) return undefined
    const kind = period.phaseCode === 'daewoon_transition' ? 'transition' : 'phase'
    if (point.code !== `${theme}_${kind}_${shadow ? 'constraint' : 'option'}`) return undefined
    if (shadow) {
      if (period.temporalRole === 'past') return '이 구조적 차이로 그 시기의 실제 일을 단정할 수는 없어요.'
      if (period.temporalRole === 'future') return '이 방향만으로 앞으로의 일을 단정할 수는 없어요.'
      return '이 강조가 구체적인 결과를 뜻하는 것은 아니에요.'
    }
    if (brief.role === 'closing') {
      if (period.temporalRole === 'target' && period.annualTargetYear !== undefined) {
        return `앞서 짚은 ${period.annualTargetYear}년의 ${THEME[theme]} 흐름을 다시 떠올려 볼 수 있어요.`
      }
      if (period.temporalRole === 'current') return `현재 대운에서 살핀 ${THEME[theme]}의 강조를 다시 놓아 볼 수 있어요.`
      if (period.temporalRole === 'future') return period.changeDirection === 'receded'
        ? `다음 대운에서 ${THEME[theme]}의 비중이 잦아들 수 있다는 방향도 함께 정리해 볼 수 있어요.`
        : `다음 대운에서 ${THEME[theme]}이 새로 강조될 수 있다는 방향도 함께 정리해 볼 수 있어요.`
    }
    if (period.temporalRole === 'past' && period.changeDirection === 'introduced') {
      return `직전 대운에서는 현재 대운에 비해 ${THEME[theme]}의 방향이 상대적으로 강조된 흐름으로 읽혀요.`
    }
    if (period.temporalRole === 'future' && period.changeDirection === 'introduced') {
      return `다음 대운에서는 현재보다 ${THEME[theme]}의 방향이 새로 강조될 수 있어요.`
    }
    if (period.temporalRole === 'future' && period.changeDirection === 'receded') {
      return `다음 대운에서는 ${THEME[theme]}의 방향이 현재보다 상대적으로 잦아들 수 있어요.`
    }
    if (period.temporalRole === 'target' && period.annualTargetYear !== undefined) {
      return `${period.annualTargetYear}년을 대상으로 한 세운에서는 ${THEME[theme]}의 방향이 강조될 수 있어요.`
    }
    if (period.temporalRole === 'current') return `현재 선택된 대운에서는 ${THEME[theme]}의 방향이 강조될 수 있어요.`
    return undefined
  }
  if (shadow) return SHADOW[point.code]
  const phrase = POSITIVE[point.code]
  if (!phrase) return undefined
  switch (brief.role) {
    case 'hook': return ordinal === 0 ? `${phrase}이 먼저 눈에 들어와요.` : `${phrase}도 함께 살펴볼 수 있어요.`
    case 'socialSelf': return brief.coverageMode === 'secondary'
      ? `다른 사람과 함께 움직이는 상황에서는 ${phrase}을 하나의 관점으로 살펴볼 수 있어요.`
      : `${phrase}이 밖으로 드러나는 방식으로 읽힐 수 있어요.`
    case 'privateSelf': return brief.coverageMode === 'secondary'
      ? `자기 기준으로 선택을 살필 때 ${phrase}을 고려할 수 있어요.`
      : `${phrase}이 한 가지 작동 방식으로 읽힐 수 있어요.`
    case 'work': return hasDomain(brief, point.source.claimCode, 'work_meeting')
      ? ordinal === 0 ? `일이나 협업의 맥락에서는 ${phrase}을 살펴볼 수 있어요.`
        : `그 안에서 ${phrase}도 함께 볼 수 있어요.` : `${phrase}을 살펴볼 수 있어요.`
    case 'relationship': return hasDomain(brief, point.source.claimCode, 'close_relationship')
      ? `가까운 관계에서는 ${phrase}을 살펴볼 수 있어요.` : `${phrase}을 살펴볼 수 있어요.`
    case 'strengthInUse': return ordinal === 0 ? `앞서 본 성향을 잘 사용하면 ${phrase}이 장점으로 작동할 수 있어요.`
      : `${phrase}도 긍정적으로 쓰일 수 있어요.`
    case 'recurringPattern': return brief.coverageMode === 'secondary'
      ? `두 방향이 함께 작동할 때 ${phrase}을 살펴볼 수 있어요.`
      : `${phrase}이 한 가지 작동 방식으로 읽힐 수 있어요.`
    case 'closing': return `앞에서 살핀 ${phrase}을 다시 떠올릴 수 있어요.`
    default: return `${phrase}이 한 가지 작동 방식으로 읽힐 수 있어요.`
  }
}

/** Existing approved wording, exposed for writers that must not infer code meaning. */
export function describeWritingPoint(brief: ChapterWritingBrief, point: WritingPoint,
  shadow: boolean): string | undefined {
  return pointSentence(brief, point, shadow)
}

export function describeMotifMaterial(motif: WritingMotifRef): string {
  return MATERIAL[motif.materialCode]
}

const HEADLINE_SHADOW: Record<string, string> = {
  competing_preferences: '자기 기준과 다른 기준의 우선순위가 엇갈림',
  extended_preparation: '준비가 길어질 가능성',
  dispersed_expression: '표현 방향이 흩어질 가능성',
  competing_resource_priorities: '자원을 둘 우선순위가 겹침',
  rigid_role_expectations: '역할 기준이 굳어질 가능성',
  competing_mode_priorities: '두 방향의 우선순위가 부딪힘',
  surface_hidden_demand_mismatch: '겉의 요구와 내부의 받침이 어긋날 가능성',
  relationship_mode_friction: '서로의 방식을 맞출 때 생길 수 있는 마찰',
  repeated_coordination_friction: '같은 조율 지점의 부담',
  directional_overconcentration: '한 방향으로 무게가 몰림',
  competing_environmental_demands: '서로 다른 환경의 요구가 겹침',
}

/** Compact approved meanings for headlines; never a paid renderer paragraph. */
export function describeHeadlineMeaning(brief: ChapterWritingBrief, point: WritingPoint): string | undefined {
  if (point.source.kind === 'contextual-motif') {
    return brief.motifRef?.mode === 'contextual' && brief.motifRef.code === point.source.motifCode
      ? POSITIVE[point.code] : undefined
  }
  if (!claimRef(brief, point.source.claimCode)) return undefined
  const period = temporal(brief, point.source.claimCode)
  if (period) {
    const theme = period.changeTheme ?? period.activatedThemes[0]
    if (!theme) return undefined
    const direction = period.changeDirection === 'receded' ? '비중 완화'
      : period.changeDirection === 'introduced' ? '새로 강조' : '방향 강조'
    return `${THEME[theme]} ${direction}`
  }
  if (point.source.field === 'shadowSide') return HEADLINE_SHADOW[point.code]
  return point.source.field === 'positiveSide' ? POSITIVE[point.code] : undefined
}

/** Last gate for every title and paragraph; tied to the brief's explicit prohibitions. */
export function isPermittedNarrativeText(brief: ChapterWritingBrief, text: string, motifOnly = false): boolean {
  return forbiddenNarrativeRuleIds(brief, text, motifOnly).length === 0
}

/** Stable, allowlisted identifiers only; never return matched text or patterns. */
export function forbiddenNarrativeRuleIds(brief: ChapterWritingBrief, text: string,
  motifOnly = false): ForbiddenInference[] {
  const matched: ForbiddenInference[] = []
  for (const code of brief.forbiddenInferences) {
    if (code === 'relative_year_without_target_check'
      && brief.temporalScope?.annualTargetYear === brief.temporalScope?.referenceYear) continue
    if (code === 'base_motif_personality' && !motifOnly) continue
    if (UNSAFE[code]?.test(text)) matched.push(code)
  }
  return matched
}

/** Pure, allowlisted projection. Unknown point codes and unsafe text are omitted. */
export function renderDeterministicNarrative(
  briefs: readonly ChapterWritingBrief[],
): readonly RenderedNarrativeChapter[] {
  const seen = new Set<number>()
  return briefs.flatMap((brief): RenderedNarrativeChapter[] => {
    if (seen.has(brief.chapter)) return []
    if (brief.coverageMode === 'neutral_bridge') {
      const heading = title(brief)
      if (!heading) return []
      const bridge = brief.bridgeSourceRefs[0]
      const bridgeRef = bridge ? claimRef(brief, bridge.code) : undefined
      const bridgePoint = brief.role === 'recurringPattern'
        ? brief.shadowPoints.find((point) => point.source.kind === 'claim'
          && point.source.claimCode === bridge?.code)
        : brief.allowedPoints.find((point) => point.source.kind === 'claim'
          && point.source.claimCode === bridge?.code)
      const bridgeMeaning = bridgePoint && (brief.role === 'recurringPattern'
        ? SHADOW[bridgePoint.code] : POSITIVE[bridgePoint.code])
      const bridgeText = bridgeMeaning && bridgeRef ? brief.role === 'socialSelf'
        ? `사람들과 함께 움직이는 상황에서도 ${bridgeMeaning}을 참고할 수 있어요. 이 말로 타인의 평가나 행동을 단정하지는 않아요.`
        : brief.role === 'relationship'
          ? `${bridgeMeaning}을 가까운 관계를 생각할 때도 참고할 수 있어요. 관계 방식이나 상대의 반응을 단정하지는 않아요.`
          : brief.role === 'recurringPattern'
            ? `${bridgeMeaning} 이 지점이 같은 문제로 되풀이되는지는 단정하지 않을게요.` : undefined : undefined
      if (bridgeText && bridgeRef && isPermittedNarrativeText(brief, bridgeText)) {
        seen.add(brief.chapter)
        return [{ chapter: brief.chapter, chapterMarkerKey: `chapter_${String(brief.chapter).padStart(2, '0')}_${brief.role}`,
          title: heading, paragraphs: [{ text: bridgeText, sourceRefs: [bridgeRef] }], sourceRefs: [bridgeRef],
          rendererVersion: 'deterministic-narrative-writer-v1' }]
      }
      const motifRef: RenderedNarrativeSourceRef[] = brief.motifRef
        ? [{ kind: 'motif', code: brief.motifRef.code }] : []
      const image = brief.motifRef ? MATERIAL[brief.motifRef.materialCode] : undefined
      const note = brief.role === 'past' ? '그 시기의 구체적인 일은 이 자료만으로 단정하지 않을게요.'
        : brief.role === 'future' ? '다음 시기의 구체적인 일은 여기서 예언하지 않을게요.'
          : brief.role === 'relationship' ? '가까운 관계의 모습을 근거 없이 정해 놓지는 않을게요.'
            : brief.role === 'privateSelf' ? '혼자 있을 때의 마음이나 행동을 근거 없이 그리지 않을게요.'
              : '확인된 내용을 벗어나는 모습은 덧붙이지 않을게요.'
      const paragraph = image ? `${image} 이미지를 앞뒤 이야기의 연결점으로만 두어요. ${note}` : note
      seen.add(brief.chapter)
      return [{ chapter: brief.chapter, chapterMarkerKey: `chapter_${String(brief.chapter).padStart(2, '0')}_${brief.role}`,
        title: heading, paragraphs: [{ text: paragraph, sourceRefs: motifRef }], sourceRefs: motifRef,
        rendererVersion: 'deterministic-narrative-writer-v1' }]
    }
    if (!brief.sourceClaimRefs.length && !brief.motifRef) return []
    const focusCodes = new Set(brief.coreMessage.sourceCodes)
    const headingCode = brief.sourceClaimRefs.find((ref) => focusCodes.has(ref.code))?.code
    const heading = title(brief)
    if (!heading || !isPermittedNarrativeText(brief, heading)) return []
    const paragraphs: RenderedNarrativeParagraph[] = []
    const add = (text: string | undefined, refs: readonly RenderedNarrativeSourceRef[], motifOnly = false) => {
      if (text && refs.length && isPermittedNarrativeText(brief, text, motifOnly)) paragraphs.push({ text, sourceRefs: refs })
    }
    if (brief.motifRef) {
      const image = MATERIAL[brief.motifRef.materialCode]
      const motifRef: RenderedNarrativeSourceRef = { kind: 'motif', code: brief.motifRef.code }
      add(brief.role === 'closing' ? `처음에 놓았던 ${image} 이미지를 다시 떠올려 볼 수 있어요.`
        : `먼저 ${image} 이미지를 떠올려 볼게요. 이 이미지는 이야기의 바탕 그림으로만 두어요.`, [motifRef], true)
      if (brief.motifRef.mode === 'contextual' && brief.role !== 'closing'
        && brief.allowedPoints.some((point) => point.source.kind === 'contextual-motif'
          && point.source.motifCode === brief.motifRef?.code)) {
        const surroundings = brief.motifRef.environmentCode && ENVIRONMENT[brief.motifRef.environmentCode]
        if (surroundings) add(`그 이미지의 주변에는 ${surroundings}가 함께 놓여 있어요.`, [motifRef], true)
      }
    }
    const positive = brief.allowedPoints.filter((point) => point.source.kind === 'claim'
      ? point.source.field === 'positiveSide' && focusCodes.has(point.source.claimCode)
      : point.source.field === 'positiveMeaning')
    for (const [index, point] of positive.entries()) {
      const ref = point.source.kind === 'claim' ? claimRef(brief, point.source.claimCode)
        : brief.motifRef ? { kind: 'motif' as const, code: brief.motifRef.code } : undefined
      if (ref) add(pointSentence(brief, point, false, index), [ref], point.source.kind === 'contextual-motif')
    }
    if (brief.role !== 'strengthInUse' && brief.role !== 'closing') {
      for (const point of brief.shadowPoints.filter((point) => point.source.kind !== 'claim'
        || focusCodes.has(point.source.claimCode)).slice(0, 2)) {
        const ref = point.source.kind === 'claim' ? claimRef(brief, point.source.claimCode)
          : brief.motifRef ? { kind: 'motif' as const, code: brief.motifRef.code } : undefined
        if (ref) add(pointSentence(brief, point, true), [ref], point.source.kind === 'contextual-motif')
      }
      const conditions = [...new Set(brief.conditions.filter((condition) => focusCodes.has(condition.claimCode)
        && condition.code === 'repeated_positions_with_surface_support')
        .map((condition) => condition.claimCode))]
      if (conditions.length) {
        const refs = conditions.flatMap((code) => claimRef(brief, code) ?? [])
        add('이 설명은 관련 구조가 여러 자리와 표면 분포에서 함께 확인된 범위에 한정돼요.', refs)
      }
      const evidence = [...new Map(brief.evidenceSummary.map((item) => [item.factKind, item])).values()].slice(0, 2)
      if (paragraphs.some((item) => item.sourceRefs.some((ref) => ref.kind === 'claim')) && evidence.length) {
        add(`근거로 확인한 항목은 ${evidence.map((item) => EVIDENCE_LABEL[item.factKind]).join('·')} 등이에요.`,
          evidence.map((item) => ({ kind: 'evidence', factId: item.factId })))
      }
    }
    if (!paragraphs.length) return []
    seen.add(brief.chapter)
    const headingRef = headingCode ? claimRef(brief, headingCode)
      : brief.motifRef ? { kind: 'motif' as const, code: brief.motifRef.code } : undefined
    const sourceRefs = [...new Map([...(headingRef ? [headingRef] : []), ...paragraphs.flatMap((item) => item.sourceRefs)]
      .map((ref) => [JSON.stringify(ref), ref])).values()]
    return [{ chapter: brief.chapter, chapterMarkerKey: `chapter_${String(brief.chapter).padStart(2, '0')}_${brief.role}`,
      title: heading, paragraphs, sourceRefs, rendererVersion: 'deterministic-narrative-writer-v1' }]
  })
}
