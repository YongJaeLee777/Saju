import { assessNarrativeClaim } from './claims'
import type { NarrativeEvidenceRegistry } from './evidence'
import { compare } from './signal-facts'
import type { NarrativeClaim, NarrativeSignal } from './types'

export interface SelectedNarrativeSignal {
  readonly signal: NarrativeSignal
  readonly claim: NarrativeClaim
  readonly independentGroups: number
}

/** Stable ranking: confidence, structural specificity, independent groups, code,
 * then semantic/evidence identity. No random choice or general-trait filler.
 */
export function rankNarrativeSignals(a: SelectedNarrativeSignal, b: SelectedNarrativeSignal): number {
  return Number(b.claim.confidence === 'strong') - Number(a.claim.confidence === 'strong')
    || b.signal.specificity - a.signal.specificity
    || b.independentGroups - a.independentGroups
    || compare(a.signal.code, b.signal.code) || compare(a.signal.meaningKey, b.signal.meaningKey)
    || compare(a.claim.evidence.map((item) => item.factId).sort().join('|'), b.claim.evidence.map((item) => item.factId).sort().join('|'))
}

export function selectNarrativeSignals(
  registry: NarrativeEvidenceRegistry, signals: readonly NarrativeSignal[],
): readonly SelectedNarrativeSignal[] {
  const accepted: SelectedNarrativeSignal[] = []
  for (const signal of signals) {
    const { methodologyVersion, meaningKey, targets, specificity, exclusive, ...candidate } = signal
    const assessment = assessNarrativeClaim(registry, candidate)
    if (assessment.status === 'accepted') accepted.push({ signal, claim: assessment.claim, independentGroups: assessment.independentGroups })
  }
  // Verified conditions are evaluated by the claim gate. If both opposing
  // values are still applicable, drop both; ranking cannot resolve a conflict.
  const compatible = accepted.filter((item) => !accepted.some((other) => item !== other
    && item.signal.exclusive && other.signal.exclusive
    && item.signal.exclusive.axis === other.signal.exclusive.axis
    && item.signal.exclusive.value !== other.signal.exclusive.value))
  compatible.sort(rankNarrativeSignals)
  const meanings = new Set<string>()
  return compatible.filter(({ signal }) => {
    if (meanings.has(signal.meaningKey)) return false
    meanings.add(signal.meaningKey)
    return true
  })
}
