import type {
  NarrativeClaim, NarrativeCoreMetaphor, NarrativeEvidence, NarrativePeriod, NarrativePlan,
  NarrativeScope, NarrativeSignalCode, NarrativeTemporalClaim,
} from './types'
import { SEMANTIC_GROUP } from './allocation'

export type ChapterRole = 'hook' | 'coreIdentity' | 'socialSelf' | 'privateSelf' | 'relationship'
  | 'work' | 'strengthInUse' | 'recurringPattern' | 'past' | 'current' | 'future' | 'closing'
export type ChapterNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
export type WritingPlanField = 'primaryTension' | 'hook' | 'socialSelf' | 'privateSelf' | 'relationship'
  | 'work' | 'hiddenStrength' | 'recurringPattern' | 'past' | 'current' | 'future'
export interface WritingClaimRef {
  readonly planField: WritingPlanField
  readonly code: string
  readonly confidence: 'strong' | 'medium'
}
export interface WritingPoint {
  readonly code: string
  readonly source: { readonly kind: 'claim'; readonly claimCode: string; readonly field: 'thesis' | 'positiveSide' | 'shadowSide' }
    | { readonly kind: 'contextual-motif'; readonly motifCode: string; readonly field: 'positiveMeaning' | 'shadowMeaning' }
}
export interface WritingCondition {
  readonly claimCode: string
  readonly code: string
  readonly factId: string
  readonly equals: string | number | boolean
}
export interface WritingEvidenceSummary {
  readonly factId: string
  readonly analyzer: string
  readonly source: NarrativeEvidence['source']
  readonly path: string
  readonly scope: NarrativeScope
  readonly factKind: 'pillar' | 'ten_god' | 'interaction' | 'flow' | 'strength' | 'other'
  /** Complex analyzer objects stay in the Plan; only scalar observations cross this boundary. */
  readonly observedValue?: string | number | boolean
  readonly period?: NarrativePeriod
}
export interface WritingMotifRef {
  readonly code: string
  readonly mode: NarrativeCoreMetaphor['mode']
  readonly materialCode: NarrativeCoreMetaphor['materialCode']
  readonly environmentCode?: string
  readonly tensionCode?: string
}
export interface WritingTemporalScope {
  readonly referenceDate: string
  readonly referenceYear: number
  readonly annualTargetYear: number | null
  readonly claims: readonly {
    readonly code: string
    readonly scope: NarrativeScope
    readonly temporalRole: 'past' | 'current' | 'future' | 'target'
    readonly period: NarrativePeriod
    readonly annualTargetYear?: number
    readonly phaseCode: NarrativeTemporalClaim['phaseCode']
    readonly activatedThemes: NarrativeTemporalClaim['activatedThemes']
    readonly changeDirection?: NarrativeTemporalClaim['changeDirection']
    readonly changeTheme?: NarrativeTemporalClaim['changeTheme']
  }[]
}
export type ForbiddenInference = 'actual_past_event' | 'mental_health_diagnosis' | 'personality_diagnosis'
  | 'spouse_trait_assertion' | 'marriage_or_divorce_prediction' | 'job_change_prediction'
  | 'wealth_event_prediction' | 'unverified_ability' | 'base_motif_personality'
  | 'relative_year_without_target_check'
export type SceneDomain = 'work_meeting' | 'planning' | 'solo_reflection' | 'close_relationship' | 'decision_making'
export type HeadlineIntent = 'self_question' | 'identity_frame' | 'visible_pattern' | 'inner_processing'
  | 'relationship_adjustment' | 'work_pattern' | 'strength_in_use' | 'hidden_pattern'
  | 'past_direction' | 'current_change' | 'future_direction' | 'synthesis'
export type CoverageMode = 'primary' | 'secondary' | 'synthesis' | 'neutral_bridge'
export type NarrativeAngle = 'behavior' | 'positive_side' | 'shadow' | 'relationship_lens'
  | 'work_lens' | 'temporal_context' | 'contrast' | 'synthesis' | 'social_lens'
  | 'choice_lens' | 'simultaneous_tension' | 'hook_preview'
  | 'social_context_bridge' | 'relationship_context_bridge' | 'pattern_caution_bridge'
export interface WritingSourceUse {
  readonly code: string
  readonly angle: NarrativeAngle
  readonly ownership: 'primary' | 'secondary' | 'bridge'
}

/** Codes and references only. No prose, prompt, scene, or inferred event. */
export interface ChapterWritingBrief {
  readonly methodologyVersion: 'writing-brief-v1'
  readonly chapter: ChapterNumber
  readonly role: ChapterRole
  readonly sourceClaimRefs: readonly WritingClaimRef[]
  readonly primarySourceRefs: readonly WritingClaimRef[]
  readonly secondarySourceRefs: readonly WritingClaimRef[]
  readonly bridgeSourceRefs: readonly WritingClaimRef[]
  readonly coverageMode: CoverageMode
  readonly sourceUses: readonly WritingSourceUse[]
  readonly headlineIntent: HeadlineIntent
  readonly coreMessage: { readonly kind: 'claim_focus' | 'motif_framing' | 'synthesis' | 'bridge_context'; readonly sourceCodes: readonly string[] }
  readonly confidence?: 'strong' | 'medium'
  readonly allowedPoints: readonly WritingPoint[]
  readonly shadowPoints: readonly WritingPoint[]
  readonly conditions: readonly WritingCondition[]
  readonly evidenceSummary: readonly WritingEvidenceSummary[]
  readonly motifRef?: WritingMotifRef
  readonly temporalScope?: WritingTemporalScope
  readonly forbiddenInferences: readonly ForbiddenInference[]
  /** Domains are permissions for a later writer, never generated life events. */
  readonly suggestedSceneDomains: readonly { readonly claimCode: string; readonly domains: readonly SceneDomain[] }[]
  readonly closingBridge?: { readonly toRole: 'closing'; readonly motifCode: string }
}

type ClaimEntry = { readonly field: WritingPlanField; readonly claim: NarrativeClaim }
type Draft = { chapter: ChapterNumber; role: ChapterRole; claims: readonly ClaimEntry[];
  intent: HeadlineIntent; domains: readonly SceneDomain[]; motif?: boolean; closing?: boolean;
  primary?: readonly ClaimEntry[]; bridge?: readonly ClaimEntry[];
  uses?: readonly WritingSourceUse[]; mode?: CoverageMode }

function factKind(fact: NarrativeEvidence): WritingEvidenceSummary['factKind'] {
  if (fact.source === 'interactions' || fact.source === 'keyPillars'
    || (fact.source === 'analysis' && /Combination|Clash|Punishment|Break|Harm/.test(fact.path))) return 'interaction'
  if (fact.source === 'flow') return 'flow'
  if (fact.source === 'strength' || fact.source === 'strengthFacts') return 'strength'
  if (/TenGod|tenGod/.test(fact.path)) return 'ten_god'
  if (/\b(stem|branch)\b/.test(fact.path)) return 'pillar'
  return 'other'
}

function motifReference(motif: NarrativeCoreMetaphor): WritingMotifRef {
  return { code: motif.code, mode: motif.mode, materialCode: motif.materialCode,
    ...(motif.mode === 'contextual' ? { environmentCode: motif.environmentCode,
      ...(motif.tensionCode ? { tensionCode: motif.tensionCode } : {}) } : {}) }
}

function temporalClaim(value: NarrativeClaim): value is NarrativeTemporalClaim {
  return 'temporalMethodologyVersion' in value && value.temporalMethodologyVersion === 'narrative-temporal-v1'
}

/** A pure projection from validated Plan data. Unresolvable sources are omitted. */
export function buildChapterWritingBriefs(plan: NarrativePlan): readonly ChapterWritingBrief[] {
  const evidence = new Map((plan.evidence ?? []).map((fact) => [fact.id, fact]))
  const valid = (claim: NarrativeClaim) => claim.evidence.length > 0
    && claim.evidence.every((use) => evidence.has(use.factId))
    && (!claim.condition || evidence.has(claim.condition.factId))
  const entries = (field: WritingPlanField): ClaimEntry[] => {
    const value = plan[field]
    if (!value) return []
    return ('code' in value ? [value] : value).filter(valid).map((claim) => ({ field, claim }))
  }
  const motif = plan.coreMetaphor
  const motifValid = motif.evidence.length > 0 && motif.evidence.every((use) => evidence.has(use.factId))
  const drafts: Draft[] = [
    { chapter: 1, role: 'hook', claims: entries('hook'), intent: 'self_question', domains: ['decision_making'] },
    { chapter: 2, role: 'coreIdentity', claims: entries('primaryTension'), intent: 'identity_frame',
      domains: ['solo_reflection'], motif: motifValid },
    { chapter: 3, role: 'socialSelf', claims: entries('socialSelf'), intent: 'visible_pattern', domains: ['work_meeting'] },
    { chapter: 4, role: 'privateSelf', claims: entries('privateSelf'), intent: 'inner_processing', domains: ['solo_reflection'] },
    { chapter: 5, role: 'relationship', claims: entries('relationship'), intent: 'relationship_adjustment',
      domains: ['close_relationship'] },
    { chapter: 6, role: 'work', claims: entries('work'), intent: 'work_pattern', domains: ['planning', 'work_meeting'] },
    { chapter: 8, role: 'recurringPattern', claims: entries('recurringPattern'), intent: 'hidden_pattern',
      domains: ['decision_making'] },
    { chapter: 9, role: 'past', claims: entries('past'), intent: 'past_direction', domains: ['solo_reflection'] },
    { chapter: 10, role: 'current', claims: entries('current'), intent: 'current_change', domains: ['planning'] },
    { chapter: 11, role: 'future', claims: entries('future'), intent: 'future_direction', domains: ['planning'] },
  ]
  const earlier = drafts.filter((draft) => draft.chapter > 1 && draft.chapter < 7).flatMap((draft) => draft.claims)
  const usedCodes = new Set(earlier.map(({ claim }) => claim.code))
  const strength = [...entries('hiddenStrength'), ...earlier.filter(({ claim }) => claim.positiveSide)]
    .filter(({ claim }, index, all) => all.findIndex((entry) => entry.claim.code === claim.code) === index)
    .filter(({ claim, field }) => field === 'hiddenStrength' || usedCodes.has(claim.code))
    .slice(0, 3)
  drafts.push({ chapter: 7, role: 'strengthInUse', claims: strength,
    intent: 'strength_in_use', domains: ['decision_making', 'planning'] })
  const previous = drafts.filter((draft) => draft.chapter !== 1).flatMap((draft) => draft.claims)
  const closingCandidates = previous.filter(({ claim }, index, all) =>
    all.findIndex((entry) => entry.claim.code === claim.code) === index)
  const closingPriority = (['primaryTension', 'current', 'future'] as const)
    .flatMap((field) => closingCandidates.find((entry) => entry.field === field) ?? [])
  const closingClaims = [
    ...closingPriority,
    ...closingCandidates.filter(({ claim }) => !closingPriority.some((entry) => entry.claim.code === claim.code)
      && claim.positiveSide),
  ].slice(0, 4)
  drafts.push({ chapter: 12, role: 'closing', claims: closingClaims,
    intent: 'synthesis', domains: ['solo_reflection'], motif: motifValid, closing: true })

  const source = (entry: ClaimEntry): WritingClaimRef => ({ planField: entry.field,
    code: entry.claim.code, confidence: entry.claim.confidence })
  const modes = [...entries('work'), ...entries('socialSelf'), ...entries('relationship'),
    ...entries('privateSelf'), ...entries('recurringPattern')]
    .filter((entry, index, all) => all.findIndex((item) => item.claim.code === entry.claim.code) === index)
  const usedAngles = new Set<string>()
  const history: { code: string; group: string; chapter: ChapterNumber }[] = []
  const semanticGroup = (code: string) => Object.hasOwn(SEMANTIC_GROUP, code)
    ? SEMANTIC_GROUP[code as NarrativeSignalCode] : code
  const bridgeAngle = (chapter: ChapterNumber): NarrativeAngle => chapter === 3
    ? 'social_context_bridge' : chapter === 5 ? 'relationship_context_bridge' : 'pattern_caution_bridge'
  const bridgeRank = (chapter: ChapterNumber, code: string): number => {
    if (chapter === 3) return ['preparation_analysis_focus', 'resource_realization_focus',
      'autonomy_coordination_focus'].includes(code) ? 0 : code === 'surface_support_contrast' ? 2 : 1
    if (chapter === 5) return ['surface_support_contrast', 'expression_production_focus',
      'autonomy_coordination_focus', 'responsibility_structure_focus'].includes(code) ? 0 : 2
    return ['preparation_expression_tension', 'autonomy_structure_tension'].includes(code) ? 0 : 1
  }
  const claimAngle = (draft: Draft, entry: ClaimEntry): NarrativeAngle => {
    if (draft.chapter === 1) return 'hook_preview'
    if (draft.chapter === 2) return entry.field === 'primaryTension' ? 'contrast' : 'behavior'
    if (draft.chapter === 3) return 'social_lens'
    if (draft.chapter === 4) return entry.field === 'privateSelf' ? 'contrast' : 'choice_lens'
    if (draft.chapter === 5) return 'relationship_lens'
    if (draft.chapter === 6) return 'work_lens'
    if (draft.chapter === 7) return 'positive_side'
    if (draft.chapter === 8) return entry.field === 'recurringPattern' ? 'shadow' : 'simultaneous_tension'
    if (draft.chapter === 12) return 'synthesis'
    return 'temporal_context'
  }
  const eligible = (chapter: ChapterNumber, entry: ClaimEntry): boolean => {
    const code = entry.claim.code
    if (chapter === 2) return true
    if (chapter === 3) return code === 'expression_production_focus' || code === 'responsibility_structure_focus'
      || code === 'visible_expression_pattern' || code === 'visible_responsibility_pattern'
    if (chapter === 4) return code === 'autonomy_coordination_focus' || code === 'preparation_analysis_focus'
      || code === 'resource_realization_focus'
    if (chapter === 5) return code === 'expression_production_focus' || code === 'autonomy_coordination_focus'
      || code === 'responsibility_structure_focus'
    if (chapter === 6) return modes.some((item) => item.claim.code === code)
    if (chapter === 7) return Boolean(entry.claim.positiveSide)
    if (chapter === 8) return Boolean(entry.claim.shadowSide) && (code === 'preparation_expression_tension'
      || code === 'autonomy_structure_tension')
    return false
  }
  const covered = drafts.sort((a, b) => a.chapter - b.chapter).map((draft): Draft => {
    const primary = draft.chapter === 1 ? draft.claims.filter((entry) =>
      plan.hookPreviews?.some((item) => item.claimCode === entry.claim.code && item.owner === null))
      : draft.chapter === 7 ? draft.claims.filter((entry) => entry.field === 'hiddenStrength')
        : draft.chapter === 12 ? [] : [...draft.claims]
    const initial = draft.chapter === 1 || draft.chapter === 7 || draft.chapter === 12 ? [...draft.claims]
      : [...primary]
    const claims = [...initial]
    const preferred = draft.chapter === 8 ? [...entries('primaryTension'), ...modes] : modes
    if (!claims.length && [1, 2, 3, 4, 5, 6, 7, 8].includes(draft.chapter)) {
      const candidates = draft.chapter === 1 ? [...entries('primaryTension'), ...modes]
        : draft.chapter === 2 ? modes.filter((entry) => entry.claim.code !== 'surface_support_contrast')
          : preferred
      const next = candidates.find((entry) => (draft.chapter === 1 || eligible(draft.chapter, entry))
        && !usedAngles.has(`${entry.claim.code}:${claimAngle(draft, entry)}`))
      if (next) claims.push(next)
    }
    const uses = claims.flatMap((entry): WritingSourceUse[] => {
      const angle = claimAngle(draft, entry)
      const key = `${entry.claim.code}:${angle}`
      if (usedAngles.has(key)) return []
      usedAngles.add(key)
      return [{ code: entry.claim.code, angle,
        ownership: primary.some((item) => item.claim.code === entry.claim.code) ? 'primary' : 'secondary' }]
    })
    const selected = claims.filter((entry) => uses.some((use) => use.code === entry.claim.code))
    const selectedPrimary = primary.filter((entry) => selected.some((item) => item.claim.code === entry.claim.code))
    const mode: CoverageMode = draft.chapter === 12 && (selected.length || draft.motif) ? 'synthesis'
      : selectedPrimary.length || draft.chapter === 2 && draft.motif && motif.mode === 'contextual' ? 'primary'
        : selected.length ? 'secondary' : 'neutral_bridge'
    const bridgeCandidates = draft.chapter === 8 ? [...entries('primaryTension'), ...modes] : modes
    const bridge = mode === 'neutral_bridge' && [3, 5, 8].includes(draft.chapter)
      ? bridgeCandidates.filter((entry) => draft.chapter !== 8 || Boolean(entry.claim.shadowSide))
        .sort((a, b) => bridgeRank(draft.chapter, a.claim.code) - bridgeRank(draft.chapter, b.claim.code)
          || (history.filter((item) => item.code === a.claim.code).at(-1)?.chapter ?? -1)
            - (history.filter((item) => item.code === b.claim.code).at(-1)?.chapter ?? -1)
          || history.filter((item) => item.group === semanticGroup(a.claim.code)).length
            - history.filter((item) => item.group === semanticGroup(b.claim.code)).length
          || a.claim.code.localeCompare(b.claim.code)).slice(0, 1) : []
    const bridgeUses = bridge.flatMap((entry): WritingSourceUse[] => {
      const angle = bridgeAngle(draft.chapter)
      const key = `${entry.claim.code}:${angle}`
      if (usedAngles.has(key)) return []
      usedAngles.add(key)
      return [{ code: entry.claim.code, angle, ownership: 'bridge' }]
    })
    const selectedBridge = bridge.filter((entry) => bridgeUses.some((use) => use.code === entry.claim.code))
    for (const use of [...uses, ...bridgeUses]) history.push({ code: use.code,
      group: semanticGroup(use.code), chapter: draft.chapter })
    return { ...draft, claims: [...selected, ...selectedBridge], primary: selectedPrimary,
      bridge: selectedBridge, uses: [...uses, ...bridgeUses], mode,
      motif: Boolean(draft.motif || mode === 'neutral_bridge' && motifValid) }
  })

  return covered
    .map((draft): ChapterWritingBrief => {
      const usedFacts = new Set(draft.claims.flatMap(({ claim }) => claim.evidence.map((use) => use.factId)))
      for (const { claim } of draft.claims) if (claim.condition) usedFacts.add(claim.condition.factId)
      if (draft.motif) for (const use of motif.evidence) usedFacts.add(use.factId)
      const summaries = [...usedFacts].sort().flatMap((id): WritingEvidenceSummary[] => {
        const fact = evidence.get(id)
        if (!fact) return []
        const observedValue = typeof fact.value === 'string' || typeof fact.value === 'number'
          || typeof fact.value === 'boolean' ? fact.value : undefined
        return [{ factId: id, analyzer: fact.analyzer, source: fact.source, path: fact.path,
          scope: fact.scope, factKind: factKind(fact),
          ...(observedValue !== undefined ? { observedValue } : {}),
          ...(fact.period ? { period: fact.period } : {}) }]
      })
      const allowed: WritingPoint[] = []
      const shadows: WritingPoint[] = []
      for (const { claim } of draft.claims) {
        if (draft.bridge?.some((entry) => entry.claim.code === claim.code)) {
          if (draft.chapter === 8 && claim.shadowSide) shadows.push({ code: claim.shadowSide,
            source: { kind: 'claim', claimCode: claim.code, field: 'shadowSide' } })
          else if (draft.chapter !== 8) allowed.push({ code: claim.positiveSide,
            source: { kind: 'claim', claimCode: claim.code, field: 'positiveSide' } })
          continue
        }
        if (draft.chapter !== 7 && claim.thesis) allowed.push({ code: claim.thesis,
          source: { kind: 'claim', claimCode: claim.code, field: 'thesis' } })
        allowed.push({ code: claim.positiveSide, source: { kind: 'claim', claimCode: claim.code, field: 'positiveSide' } })
        if (draft.chapter !== 7 && claim.shadowSide) shadows.push({ code: claim.shadowSide,
          source: { kind: 'claim', claimCode: claim.code, field: 'shadowSide' } })
      }
      if (draft.motif && draft.mode !== 'neutral_bridge' && motif.mode === 'contextual') {
        allowed.push({ code: motif.positiveMeaning,
          source: { kind: 'contextual-motif', motifCode: motif.code, field: 'positiveMeaning' } })
        shadows.push({ code: motif.shadowMeaning,
          source: { kind: 'contextual-motif', motifCode: motif.code, field: 'shadowMeaning' } })
      }
      const forbidden: ForbiddenInference[] = ['mental_health_diagnosis', 'personality_diagnosis',
        'unverified_ability', 'base_motif_personality']
      if (draft.role === 'past' || draft.claims.some(({ field }) => field === 'past')) forbidden.push('actual_past_event')
      if (draft.role === 'relationship' || draft.claims.some(({ field }) => field === 'relationship')) {
        forbidden.push('spouse_trait_assertion', 'marriage_or_divorce_prediction')
      }
      if (draft.role === 'future' || draft.role === 'current' || (draft.closing
        && draft.claims.some(({ field }) => field === 'current' || field === 'future'))) forbidden.push('marriage_or_divorce_prediction',
        'job_change_prediction', 'wealth_event_prediction', 'relative_year_without_target_check')
      const temporal = draft.claims.filter(({ claim }) => temporalClaim(claim))
      const confidence = draft.mode === 'neutral_bridge' ? undefined
        : draft.claims.length ? draft.claims.every(({ claim }) => claim.confidence === 'strong')
        ? 'strong' : 'medium' : motif.mode === 'contextual' && draft.motif
          ? motif.confidence : undefined
      return {
        methodologyVersion: 'writing-brief-v1', chapter: draft.chapter, role: draft.role,
        sourceClaimRefs: draft.claims.map(source),
        primarySourceRefs: (draft.primary ?? []).map(source),
        secondarySourceRefs: draft.claims.filter((entry) => !draft.primary?.some((owner) => owner.claim.code === entry.claim.code)
          && !draft.bridge?.some((bridge) => bridge.claim.code === entry.claim.code)).map(source),
        bridgeSourceRefs: (draft.bridge ?? []).map(source),
        sourceUses: draft.uses ?? [], coverageMode: draft.mode ?? 'neutral_bridge',
        headlineIntent: draft.intent,
        coreMessage: { kind: draft.closing ? 'synthesis' : draft.mode === 'neutral_bridge'
          ? draft.bridge?.length ? 'bridge_context' : 'motif_framing'
            : draft.motif && !draft.claims.length ? 'motif_framing' : 'claim_focus',
          sourceCodes: draft.claims.map(({ claim }) => claim.code) },
        ...(confidence ? { confidence } : {}), allowedPoints: allowed, shadowPoints: shadows,
        conditions: draft.claims.flatMap(({ claim }) => claim.condition ? [{ claimCode: claim.code, ...claim.condition }] : []),
        evidenceSummary: summaries,
        ...(draft.motif ? { motifRef: motifReference(motif) } : {}),
        ...(temporal.length ? { temporalScope: { referenceDate: plan.referenceDate, referenceYear: plan.referenceYear,
          annualTargetYear: plan.annualTargetYear,
          claims: temporal.map(({ claim }) => {
            if (!temporalClaim(claim) || !claim.context.temporalRole) throw new Error('Invalid temporal claim.')
            return { code: claim.code, scope: claim.context.scope, temporalRole: claim.context.temporalRole,
              period: claim.period, phaseCode: claim.phaseCode, activatedThemes: claim.activatedThemes,
              ...(claim.changeDirection ? { changeDirection: claim.changeDirection } : {}),
              ...(claim.changeTheme ? { changeTheme: claim.changeTheme } : {}),
              ...(claim.annualTargetYear !== undefined ? { annualTargetYear: claim.annualTargetYear } : {}) }
          }) } } : {}),
        forbiddenInferences: [...new Set(forbidden)],
        suggestedSceneDomains: draft.claims.map(({ claim }) => ({ claimCode: claim.code, domains: draft.domains })),
      }
    })
}
