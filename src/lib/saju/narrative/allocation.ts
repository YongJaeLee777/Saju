import type { NarrativeEvidenceRegistry } from './evidence'
import { rankNarrativeSignals, type SelectedNarrativeSignal } from './selection'
import type {
  NarrativeClaim, NarrativeHookPreviewReference, NarrativeSelectionField, NarrativeSemanticGroup,
  NarrativeSignal, NarrativeSignalCode, NarrativeTenGodGroup,
} from './types'

const fields: readonly NarrativeSelectionField[] = [
  'primaryTension', 'socialSelf', 'privateSelf', 'relationship', 'work', 'recurringPattern', 'hiddenStrength',
]
const limits: Readonly<Record<NarrativeSelectionField, number>> = {
  primaryTension: 1, socialSelf: 2, privateSelf: 1, relationship: 2, work: 5, recurringPattern: 2, hiddenStrength: 2,
}

/** Each code has one explicit meaning axis. Different codes on the same axis
 * compete only when their supporting fact lineages overlap. */
export const SEMANTIC_GROUP: Readonly<Record<NarrativeSignalCode, NarrativeSemanticGroup>> = {
  autonomy_coordination_focus: 'autonomy_coordination',
  preparation_analysis_focus: 'preparation_analysis',
  expression_production_focus: 'expression_production',
  resource_realization_focus: 'resource_realization',
  responsibility_structure_focus: 'responsibility_structure',
  preparation_expression_tension: 'preparation_expression_tension',
  autonomy_structure_tension: 'autonomy_structure_tension',
  visible_expression_pattern: 'expression_production',
  visible_responsibility_pattern: 'responsibility_structure',
  surface_support_contrast: 'surface_hidden_contrast',
  relationship_expression_adjustment: 'relationship_expression_adjustment',
  relationship_boundary_adjustment: 'relationship_boundary_adjustment',
  relationship_responsibility_adjustment: 'relationship_responsibility_adjustment',
  recurring_coordination_tension: 'recurring_tension',
}

interface SemanticCandidate {
  readonly item: SelectedNarrativeSignal
  readonly roots: ReadonlySet<string>
}

interface Candidate extends SemanticCandidate {
  readonly field: NarrativeSelectionField
  readonly directness: number
}

export interface NarrativeAllocation {
  readonly body: Readonly<Partial<Record<NarrativeSelectionField, readonly NarrativeClaim[]>>>
  readonly hook: readonly NarrativeClaim[]
  readonly hookPreviews: readonly NarrativeHookPreviewReference[]
}

function directness(field: NarrativeSelectionField, signal: NarrativeSignal): number {
  const basis = signal.attributes.basis
  if (field === 'primaryTension' && basis === 'coexisting-strong-patterns') return 5
  if (field === 'socialSelf' && basis === 'visible-repetition-exposure') return 5
  if (field === 'privateSelf' && basis === 'surface-hidden-contrast') return 5
  if (field === 'relationship' && basis === 'day-branch-relation-with-pattern') return 5
  if (field === 'recurringPattern' && basis === 'independent-relation-recurrence') return 5
  if (field === 'work' && basis === 'position-repetition') return 5
  if (field === 'work' && basis === 'visible-repetition-exposure') return 2
  if (field === 'hiddenStrength') return 1
  return 0
}

function supportRoots(registry: NarrativeEvidenceRegistry, claim: NarrativeClaim, dayStemRoot: string): ReadonlySet<string> {
  return new Set(claim.evidence.filter((use) => use.role !== 'context' && use.direction === 'supports')
    .flatMap((use) => registry.rootFactIds(use.factId)).filter((root) => root !== dayStemRoot))
}

function sameMeaning(a: SemanticCandidate, b: SemanticCandidate): boolean {
  if (a.item.claim.code === b.item.claim.code) return true
  return SEMANTIC_GROUP[a.item.signal.code] === SEMANTIC_GROUP[b.item.signal.code]
    && [...a.roots].some((root) => b.roots.has(root))
}

/** Assign accepted claims once. Direct structural evidence wins; field order
 * breaks equal directness, followed by the existing deterministic signal rank. */
export function allocateNarrativeClaims(
  registry: NarrativeEvidenceRegistry, selected: readonly SelectedNarrativeSignal[],
): NarrativeAllocation {
  const dayStemRoot = registry.register({ source: 'natal', path: 'day.stem' }).id
  const candidates: Candidate[] = selected.flatMap((item) => fields.flatMap((field) => {
    if (!item.signal.targets.includes(field)) return []
    if (field === 'primaryTension' && item.claim.confidence !== 'strong') return []
    if (field === 'hiddenStrength' && (item.claim.confidence !== 'strong'
      || item.signal.attributes.independentCorroboration !== 'exposure')) return []
    const score = directness(field, item.signal)
    if (score === 0) return []
    return [{ item, field, directness: score,
      roots: supportRoots(registry, item.claim, dayStemRoot) }]
  }))
  candidates.sort((a, b) => b.directness - a.directness
    || fields.indexOf(a.field) - fields.indexOf(b.field)
    || rankNarrativeSignals(a.item, b.item))

  const owners: Candidate[] = []
  const body: Partial<Record<NarrativeSelectionField, NarrativeClaim[]>> = {}
  for (const candidate of candidates) {
    if ((body[candidate.field]?.length ?? 0) >= limits[candidate.field]) continue
    if (owners.some((owner) => sameMeaning(owner, candidate))) continue
    const bucket = body[candidate.field] ?? (body[candidate.field] = [])
    bucket.push(candidate.item.claim)
    owners.push(candidate)
  }

  const hook: NarrativeClaim[] = []
  const hookPreviews: NarrativeHookPreviewReference[] = []
  const hookThemes = new Set<NarrativeTenGodGroup>()
  const hookCandidates: SemanticCandidate[] = []
  for (const item of [...selected].sort(rankNarrativeSignals)) {
    const candidate: SemanticCandidate = { item, roots: supportRoots(registry, item.claim, dayStemRoot) }
    if (item.signal.attributes.groups.some((group) => hookThemes.has(group))) continue
    if (hookCandidates.some((existing) => sameMeaning(existing, candidate))) continue
    hook.push(item.claim)
    hookCandidates.push(candidate)
    item.signal.attributes.groups.forEach((group) => hookThemes.add(group))
    hookPreviews.push({ claimCode: item.signal.code, semanticGroup: SEMANTIC_GROUP[item.signal.code],
      owner: owners.find((owner) => owner.item.claim === item.claim)?.field ?? null })
    if (hook.length === 3) break
  }
  return { body, hook, hookPreviews }
}
