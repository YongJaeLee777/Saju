import type {
  AnalysisFacts, DaewoonResult, InterpretationFacts, LuckFlowFacts,
  FiveElement, SajuResult, StrengthAssessment, StrengthFacts,
  RootPillar,
} from '../types'

/** Existing objects are borrowed, not recalculated. Treat nested values as read-only. */
export interface NarrativeContext {
  readonly methodologyVersion: 'narrative-context-v1'
  readonly referenceInstant: string
  /** Civil date/year in Asia/Seoul, distinct from the selected Lichun year. */
  readonly referenceDate: string
  readonly referenceYear: number
  readonly annualTargetYear: number | null
  readonly hasBirthTime: boolean
  readonly timing: {
    readonly daewoon: 'resolved' | 'birth-time-missing' | 'unavailable' | 'outside-cycles'
    readonly annualMatchesReferenceYear: boolean
    readonly annualContainsReferenceInstant: boolean
  }
  readonly natal: SajuResult
  readonly analysis: AnalysisFacts
  readonly strengthFacts: StrengthFacts
  readonly strength: StrengthAssessment
  readonly daewoonResult: DaewoonResult
  readonly luck: InterpretationFacts['luck']
  readonly interactions: InterpretationFacts['interactions']
  readonly flow: LuckFlowFacts
  readonly keyPillars: InterpretationFacts['keyPillars']
  readonly interpretationFacts: InterpretationFacts
}

export type NarrativeScope = 'natal' | 'daewoon' | 'annual'
export interface NarrativePeriod {
  readonly startDateTime: string
  /** Exclusive. */
  readonly endDateTime: string
}
export type NarrativeFactSource =
  | 'natal' | 'analysis' | 'strengthFacts' | 'strength'
  | 'daewoon' | 'daewoonResult' | 'annual' | 'interactions' | 'flow' | 'keyPillars' | 'interpretationFacts'

export interface NarrativeFactReference {
  readonly source: NarrativeFactSource
  /** Dot-separated own-property path within source; never an expression. */
  readonly path: string
}
export interface NarrativeEvidence extends NarrativeFactReference {
  /** Deterministic chart/source/path/period/version identity, not an array counter. */
  readonly id: string
  readonly analyzer: string
  readonly value: unknown
  /** Primary scope. Mixed origins remain available through derivedFrom. */
  readonly scope: NarrativeScope
  readonly period?: NarrativePeriod
  /** 'unversioned' explicitly marks existing sources without a version field. */
  readonly calculationVersion: string
  readonly methodologyVersion: 'narrative-evidence-v1'
  readonly derivedFrom?: readonly string[]
}

export interface NarrativePredicate {
  readonly factId: string
  readonly equals: string | number | boolean
}
export interface NarrativeCondition extends NarrativePredicate {
  readonly code: string
}
export interface NarrativeEvidenceUse {
  readonly factId: string
  readonly direction: 'supports' | 'opposes'
  /** Explicit claim-specific rule judgment, never copied from legacy strength. */
  readonly weight: 'strong' | 'weak'
  readonly ruleId: string
  /** Preconditions/aggregates are auditable but never add independent support. */
  readonly role?: 'support' | 'context'
  readonly when?: NarrativePredicate
}
export interface NarrativeClaimContext {
  readonly scope: NarrativeScope
  readonly period?: NarrativePeriod
  /** target permits a named annual year without calling it the current year. */
  readonly temporalRole?: 'past' | 'current' | 'future' | 'target'
  /** Adjacent cycle supplying an explicit comparison, never the claim's target period. */
  readonly comparisonPeriod?: NarrativePeriod
}
export interface NarrativeClaimCandidate {
  readonly code: string
  readonly thesis?: string
  readonly evidence: readonly NarrativeEvidenceUse[]
  /** Codes only in this foundation; no prose is generated here. */
  readonly positiveSide: string
  readonly shadowSide?: string
  readonly condition?: NarrativeCondition
  readonly context?: NarrativeClaimContext
  readonly attributes?: NarrativeSignalAttributes
}
export interface NarrativeClaim extends NarrativeClaimCandidate {
  readonly evidence: readonly [NarrativeEvidenceUse, ...NarrativeEvidenceUse[]]
  readonly confidence: 'strong' | 'medium'
}
export type NarrativeTemporalTheme = 'peers' | 'resource' | 'output' | 'wealth' | 'officer'
export interface NarrativeTemporalClaim extends NarrativeClaim {
  readonly temporalMethodologyVersion: 'narrative-temporal-v1'
  readonly phaseCode: 'daewoon_phase' | 'annual_target_phase' | 'daewoon_transition'
  readonly activatedThemes: readonly NarrativeTemporalTheme[]
  readonly changeDirection?: 'introduced' | 'receded'
  readonly changeTheme?: NarrativeTemporalTheme
  readonly period: NarrativePeriod
  readonly annualTargetYear?: number
  readonly context: NarrativeClaimContext & { readonly period: NarrativePeriod }
}
export type NarrativeMaterialCode = 'standing_tree' | 'twining_vine' | 'daylight' | 'lamplight'
  | 'mountain_ground' | 'garden_soil' | 'rough_metal' | 'polished_metal' | 'river_current' | 'rainwater'
export type NarrativeEnvironmentCode = 'support_reinforced' | 'demand_reinforced'
  | 'support_counterposed' | 'demand_counterposed'
export type NarrativeAnchorCode = 'root_observed' | 'aligned_exposure_observed'
interface NarrativeMotifFraming {
  /** An image reference, not a personality CLAIM or a rendered sentence. */
  readonly kind: 'narrative-framing'
  readonly code: string
  readonly materialCode: NarrativeMaterialCode
  readonly dayStem: string
  readonly dayElement: FiveElement
  readonly polarity: 'yang' | 'yin'
  readonly evidence: readonly [NarrativeEvidenceUse, ...NarrativeEvidenceUse[]]
  readonly methodologyVersion: 'core-metaphor-v1'
}
export interface NarrativeBaseMotif extends NarrativeMotifFraming {
  readonly mode: 'base'
  readonly environmentCode?: never
  readonly anchorCode?: never
  readonly tensionCode?: never
  readonly confidence?: never
  readonly positiveMeaning?: never
  readonly shadowMeaning?: never
  readonly closingMotif: { readonly referenceCode: string; readonly mode: 'material_only' }
}
export interface NarrativeContextualMetaphor extends NarrativeMotifFraming {
  readonly mode: 'contextual'
  /** Legacy v1 environment code remains stable; materialCode distinguishes the ten stems. */
  readonly environmentCode: NarrativeEnvironmentCode
  readonly anchorCode?: NarrativeAnchorCode
  readonly tensionCode?: 'preparation_expression_tension' | 'autonomy_structure_tension'
  readonly confidence: 'strong' | 'medium'
  readonly positiveMeaning: string
  readonly shadowMeaning: string
  readonly closingMotif: { readonly referenceCode: string; readonly mode: 'material_environment' | 'material_environment_tension' }
}
export type NarrativeCoreMetaphor = NarrativeBaseMotif | NarrativeContextualMetaphor
export type NarrativeClaimAssessment =
  | { readonly status: 'accepted'; readonly claim: NarrativeClaim; readonly independentGroups: number }
  | { readonly status: 'excluded'; readonly reason:
    'invalid-evidence' | 'weak' | 'conflict' | 'condition-unresolved' | 'period-unresolved' }

export type NarrativeTenGodGroup = 'peers' | 'resource' | 'output' | 'wealth' | 'officer'
export type NarrativeSignalCode =
  | 'autonomy_coordination_focus' | 'preparation_analysis_focus' | 'expression_production_focus'
  | 'resource_realization_focus' | 'responsibility_structure_focus'
  | 'preparation_expression_tension' | 'autonomy_structure_tension'
  | 'visible_expression_pattern' | 'visible_responsibility_pattern' | 'surface_support_contrast'
  | 'relationship_expression_adjustment' | 'relationship_boundary_adjustment' | 'relationship_responsibility_adjustment'
  | 'recurring_coordination_tension'
export type NarrativeSelectionField = 'primaryTension' | 'socialSelf' | 'privateSelf' | 'relationship'
  | 'work' | 'hiddenStrength' | 'recurringPattern'
export type NarrativeSemanticGroup = 'preparation_analysis' | 'expression_production' | 'autonomy_coordination'
  | 'responsibility_structure' | 'resource_realization' | 'preparation_expression_tension'
  | 'autonomy_structure_tension' | 'surface_hidden_contrast' | 'relationship_expression_adjustment'
  | 'relationship_boundary_adjustment' | 'relationship_responsibility_adjustment' | 'recurring_tension'
export interface NarrativeHookPreviewReference {
  readonly claimCode: NarrativeSignalCode
  readonly semanticGroup: NarrativeSemanticGroup
  /** Null means the accepted claim has no body owner in this plan. */
  readonly owner: NarrativeSelectionField | null
}
export interface NarrativePosition {
  readonly pillar: RootPillar
  readonly position: 'stem' | 'branch'
}
export type NarrativeRelationKind = 'combination' | 'clash' | 'punishment' | 'break' | 'harm'
export interface NarrativeSignalAttributes {
  readonly groups: readonly NarrativeTenGodGroup[]
  readonly positions: readonly NarrativePosition[]
  readonly basis: 'position-repetition' | 'visible-repetition-exposure' | 'surface-hidden-contrast'
    | 'day-branch-relation-with-pattern' | 'independent-relation-recurrence' | 'coexisting-strong-patterns'
  readonly independentCorroboration?: 'exposure'
  readonly relationKinds?: readonly NarrativeRelationKind[]
  readonly relationPillars?: readonly (readonly RootPillar[])[]
  readonly contrast?: 'surface-drain-hidden-support' | 'surface-support-hidden-drain'
  /** Bounds all meanings to structural candidates; never a diagnosed trait/event. */
  readonly interpretationLimit: 'structural-candidate'
}
export interface NarrativeSignal extends NarrativeClaimCandidate {
  readonly code: NarrativeSignalCode
  readonly methodologyVersion: 'narrative-signals-v1'
  readonly meaningKey: string
  readonly attributes: NarrativeSignalAttributes
  readonly targets: readonly NarrativeSelectionField[]
  readonly specificity: number
  /** Opposite values on the same axis must not survive unresolved together. */
  readonly exclusive?: { readonly axis: string; readonly value: string }
}

/** Selection-ready only. Weak/excluded assessments cannot be assigned as claims. */
export interface NarrativePlan {
  readonly methodologyVersion: 'narrative-plan-v1'
  readonly referenceDate: string
  readonly referenceYear: number
  readonly annualTargetYear: number | null
  readonly signalMethodologyVersion?: 'narrative-signals-v1'
  readonly allocationMethodologyVersion?: 'narrative-allocation-v1'
  /** Selected evidence plus transitive ancestors, sufficient to resolve every id. */
  readonly evidence?: readonly NarrativeEvidence[]
  /** Every valid natal chart has a non-claim base motif. */
  readonly coreMetaphor: NarrativeCoreMetaphor
  readonly primaryTension?: NarrativeClaim
  /** Preview candidates; chapter ownership is recorded separately below. */
  readonly hook?: readonly NarrativeClaim[]
  readonly hookPreviews?: readonly NarrativeHookPreviewReference[]
  readonly socialSelf?: readonly NarrativeClaim[]
  readonly privateSelf?: readonly NarrativeClaim[]
  readonly relationship?: readonly NarrativeClaim[]
  readonly work?: readonly NarrativeClaim[]
  /** v1 reserves this for repeated strengths; no rarity inference. */
  readonly hiddenStrength?: readonly NarrativeClaim[]
  readonly recurringPattern?: readonly NarrativeClaim[]
  readonly past?: readonly NarrativeTemporalClaim[]
  readonly current?: readonly NarrativeTemporalClaim[]
  readonly future?: readonly NarrativeTemporalClaim[]
}
