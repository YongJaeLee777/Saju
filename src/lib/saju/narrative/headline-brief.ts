import { describeHeadlineMeaning, describeMotifMaterial } from './deterministic-writer'
import { buildCopySemantics } from './copy-semantics'
import type { CopyHeadlineAngle } from './copy-semantics'
import type { LockedPreviewChapter } from './locked-preview'
import type { ChapterRole, ChapterWritingBrief, ForbiddenInference, HeadlineIntent } from './writing-brief'

const ROLES: readonly { role: ChapterRole; intent: HeadlineIntent }[] = [
  { role: 'hook', intent: 'self_question' }, { role: 'coreIdentity', intent: 'identity_frame' },
  { role: 'socialSelf', intent: 'visible_pattern' }, { role: 'privateSelf', intent: 'inner_processing' },
  { role: 'relationship', intent: 'relationship_adjustment' }, { role: 'work', intent: 'work_pattern' },
  { role: 'strengthInUse', intent: 'strength_in_use' }, { role: 'recurringPattern', intent: 'hidden_pattern' },
  { role: 'past', intent: 'past_direction' }, { role: 'current', intent: 'current_change' },
  { role: 'future', intent: 'future_direction' }, { role: 'closing', intent: 'synthesis' },
]

export interface HeadlineBrief {
  readonly chapter: LockedPreviewChapter['chapter']
  readonly animalKey: LockedPreviewChapter['animalKey']
  readonly role: ChapterRole
  readonly headlineIntent: HeadlineIntent
  readonly copyIntent: CopyHeadlineAngle
  readonly personalizationAllowed: boolean
  readonly allowedMeanings: readonly {
    readonly sourceRef: string
    readonly positive: readonly string[]
    readonly shadow: readonly string[]
    readonly coreMeaning: string
    readonly behavioralFramings: readonly string[]
    readonly allowedHeadlineAngles: readonly CopyHeadlineAngle[]
    readonly forbiddenExtensions: readonly string[]
  }[]
  readonly sourceRefs: readonly string[]
  readonly motifFraming?: { readonly sourceRef: string; readonly mode: 'base' | 'contextual';
    readonly image: string; readonly contextualMeanings: readonly string[] }
  readonly temporalScope?: { readonly referenceYear: number; readonly annualTargetYear: number | null;
    readonly phase: 'past' | 'current' | 'future' }
  readonly forbiddenInferences: readonly ForbiddenInference[]
}

const COPY_INTENTS: Record<HeadlineIntent, readonly CopyHeadlineAngle[]> = {
  self_question: ['behavior_reason', 'contrast', 'statement', 'self_question'],
  identity_frame: ['identity', 'contrast', 'statement'],
  visible_pattern: ['statement', 'behavior_reason'], inner_processing: ['contrast', 'identity'],
  relationship_adjustment: ['behavior_reason', 'contrast', 'statement'],
  work_pattern: ['statement', 'behavior_reason'], strength_in_use: ['statement', 'identity'],
  hidden_pattern: ['pattern', 'contrast', 'statement'], past_direction: ['time_change'],
  current_change: ['time_change'], future_direction: ['time_change'], synthesis: ['identity', 'statement', 'contrast'],
}

const COMMON_FORBIDDEN: readonly ForbiddenInference[] = [
  'actual_past_event', 'mental_health_diagnosis', 'personality_diagnosis',
  'spouse_trait_assertion', 'marriage_or_divorce_prediction', 'job_change_prediction',
  'wealth_event_prediction', 'unverified_ability', 'base_motif_personality',
  'relative_year_without_target_check',
]

/** Approved wording only. Raw fact IDs, birth input, analyzer objects and paid text stay out. */
export function buildHeadlineBriefs(
  briefs: readonly ChapterWritingBrief[], fallback: readonly LockedPreviewChapter[],
  scope: { readonly referenceYear: number; readonly annualTargetYear: number | null },
): readonly HeadlineBrief[] {
  const byChapter = new Map(briefs.map((brief) => [brief.chapter, brief]))
  return fallback.map((slot) => {
    const original = byChapter.get(slot.chapter)
    const role = ROLES[slot.chapter - 1].role
    const sourceMeanings = original?.coverageMode === 'neutral_bridge' ? [] : original?.sourceClaimRefs.flatMap((claim, index) => {
      const copy = buildCopySemantics(original, claim)
      return copy ? [{ sourceRef: `s${slot.chapter}_${index + 1}`,
        positive: copy.positiveFramings, shadow: copy.shadowFramings,
        coreMeaning: copy.coreMeaning, behavioralFramings: copy.behavioralFramings,
        allowedHeadlineAngles: copy.allowedHeadlineAngles, forbiddenExtensions: copy.forbiddenExtensions }] : []
    }) ?? []
    const motif = original?.motifRef
    const motifFraming = motif && original?.coverageMode !== 'neutral_bridge' && original?.evidenceSummary.length ? {
      sourceRef: `m${slot.chapter}`, mode: motif.mode, image: describeMotifMaterial(motif),
      contextualMeanings: motif.mode === 'contextual' ? original.allowedPoints
        .filter((point) => point.source.kind === 'contextual-motif')
        .flatMap((point) => describeHeadlineMeaning(original, point) ?? []) : [],
    } : undefined
    const personalized = Boolean(original?.coverageMode !== 'neutral_bridge'
      && original?.evidenceSummary.length && (sourceMeanings.length || motifFraming))
    const phase = role === 'past' || role === 'current' || role === 'future' ? role : undefined
    const headlineIntent = original?.headlineIntent ?? ROLES[slot.chapter - 1].intent
    const allowedAngles = sourceMeanings.flatMap((meaning) => meaning.allowedHeadlineAngles)
    if (motifFraming) allowedAngles.push('identity')
    const copyIntent = personalized ? COPY_INTENTS[headlineIntent].find((angle) => allowedAngles.includes(angle))
      ?? allowedAngles[0] : 'exploratory_question'
    return {
      chapter: slot.chapter, animalKey: slot.animalKey, role,
      headlineIntent, copyIntent,
      personalizationAllowed: personalized,
      allowedMeanings: personalized ? sourceMeanings : [],
      sourceRefs: personalized ? [...sourceMeanings.map((item) => item.sourceRef),
        ...(motifFraming ? [motifFraming.sourceRef] : [])] : [],
      ...(personalized && motifFraming ? { motifFraming } : {}),
      ...(phase ? { temporalScope: { referenceYear: scope.referenceYear,
        annualTargetYear: original?.temporalScope?.annualTargetYear ?? scope.annualTargetYear, phase } } : {}),
      forbiddenInferences: [...new Set([...COMMON_FORBIDDEN, ...(original?.forbiddenInferences ?? [])])],
    }
  })
}
