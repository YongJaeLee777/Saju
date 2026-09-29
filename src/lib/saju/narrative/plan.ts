import { NarrativeEvidenceRegistry } from './evidence'
import { allocateNarrativeClaims } from './allocation'
import { buildCoreMetaphor } from './core-metaphor'
import { buildNarrativeSignals } from './signals'
import { selectNarrativeSignals } from './selection'
import { buildTemporalNarrative } from './temporal'
import type { NarrativeContext, NarrativePlan } from './types'

/** Conservative natal selection plus structured, sourced temporal directions. */
export function buildNarrativePlan(context: NarrativeContext): NarrativePlan {
  const registry = new NarrativeEvidenceRegistry(context)
  const selected = selectNarrativeSignals(registry, buildNarrativeSignals(registry))
  const { body, hook, hookPreviews } = allocateNarrativeClaims(registry, selected)
  const primaryTension = body.primaryTension?.[0]
  const coreMetaphor = buildCoreMetaphor(context, registry, primaryTension)
  const temporal = buildTemporalNarrative(registry)
  const { socialSelf = [], privateSelf = [], relationship = [], work = [], hiddenStrength = [], recurringPattern = [] } = body
  const claims = [...(primaryTension ? [primaryTension] : []), ...hook, ...socialSelf, ...privateSelf,
    ...relationship, ...work, ...hiddenStrength, ...recurringPattern,
    ...(temporal.past ?? []), ...(temporal.current ?? []), ...(temporal.future ?? [])]
  const evidenceIds = claims.flatMap((claim) => [
    ...claim.evidence.flatMap((item) => [item.factId, ...(item.when ? [item.when.factId] : [])]),
    ...(claim.condition ? [claim.condition.factId] : []),
  ]).concat(coreMetaphor?.evidence.map((item) => item.factId) ?? [])
  return {
    methodologyVersion: 'narrative-plan-v1',
    referenceDate: context.referenceDate,
    referenceYear: context.referenceYear,
    annualTargetYear: context.annualTargetYear,
    signalMethodologyVersion: 'narrative-signals-v1',
    allocationMethodologyVersion: 'narrative-allocation-v1',
    ...(evidenceIds.length ? { evidence: registry.collect(evidenceIds) } : {}),
    ...(primaryTension ? { primaryTension } : {}),
    coreMetaphor,
    ...(hook.length ? { hook, hookPreviews } : {}),
    ...(socialSelf.length ? { socialSelf } : {}),
    ...(privateSelf.length ? { privateSelf } : {}),
    ...(relationship.length ? { relationship } : {}),
    ...(work.length ? { work } : {}),
    ...(hiddenStrength.length ? { hiddenStrength } : {}),
    ...(recurringPattern.length ? { recurringPattern } : {}),
    ...temporal,
  }
}
