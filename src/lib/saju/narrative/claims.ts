import { hasPeriod } from './context'
import type { NarrativeEvidenceRegistry } from './evidence'
import type {
  NarrativeClaimAssessment, NarrativeClaimCandidate, NarrativeEvidenceUse, NarrativePredicate,
} from './types'

function matches(registry: NarrativeEvidenceRegistry, predicate: NarrativePredicate): boolean {
  const fact = registry.get(predicate.factId)
  return fact !== undefined && Object.is(fact.value, predicate.equals)
}

function periodResolved(registry: NarrativeEvidenceRegistry, candidate: NarrativeClaimCandidate, ids: readonly string[]): boolean {
  const facts = ids.flatMap((id) => [registry.get(id), ...registry.rootFactIds(id).map((root) => registry.get(root))])
  const scopes = new Set(facts.map((fact) => fact?.scope))
  const primary = scopes.has('annual') ? 'annual' : scopes.has('daewoon') ? 'daewoon' : 'natal'
  const context = candidate.context
  if (primary === 'natal') return !context || (context.scope === 'natal' && !context.period && !context.temporalRole)
  if (!context || context.scope !== primary || !hasPeriod(context.period) || !context.temporalRole) return false
  if (scopes.has('daewoon') && (!registry.context.hasBirthTime
    || registry.context.daewoonResult.startPrecision !== 'exact' || registry.context.timing.daewoon !== 'resolved')) return false
  const start = Date.parse(context.period.startDateTime)
  const end = Date.parse(context.period.endDateTime)
  const comparison = context.comparisonPeriod
  if (comparison && (!hasPeriod(comparison) || primary !== 'daewoon'
    || (context.temporalRole !== 'past' && context.temporalRole !== 'future')
    || (context.temporalRole === 'past'
      ? Date.parse(comparison.startDateTime) !== end
      : Date.parse(comparison.endDateTime) !== start))) return false
  // A comparison fact may belong to the adjacent cycle; all other facts must
  // cover the claim's target period. Neither period can be inferred from prose.
  if (facts.some((fact) => fact && fact.scope !== 'natal' && (!hasPeriod(fact.period)
    || ((start < Date.parse(fact.period.startDateTime) || end > Date.parse(fact.period.endDateTime))
      && (!comparison || Date.parse(comparison.startDateTime) < Date.parse(fact.period.startDateTime)
        || Date.parse(comparison.endDateTime) > Date.parse(fact.period.endDateTime)))))) return false
  const now = Date.parse(registry.context.referenceInstant)
  switch (context.temporalRole) {
    case 'current': return start <= now && now < end
    case 'past': return end <= now
    case 'future': return now < start
    case 'target': return primary === 'annual'
  }
}

/** A gate for future, reviewed signal rules, not a personality/scene generator.
 * Evidence weight is a rule input; legacy signal/strength confidence is not read.
 * Two weak independent groups remain medium, as required by the v1 policy.
 */
export function assessNarrativeClaim(
  registry: NarrativeEvidenceRegistry, candidate: NarrativeClaimCandidate,
): NarrativeClaimAssessment {
  if (!candidate.code.trim() || !candidate.positiveSide.trim() || candidate.evidence.length === 0
    || candidate.evidence.some((item) => !registry.get(item.factId) || !item.ruleId.trim()
      || !['strong', 'weak'].includes(item.weight) || !['supports', 'opposes'].includes(item.direction)
      || (item.role !== undefined && !['support', 'context'].includes(item.role))
      || (item.when && !registry.get(item.when.factId)))) {
    return { status: 'excluded', reason: 'invalid-evidence' }
  }
  const condition = candidate.condition
  if (condition && (!condition.code.trim() || !matches(registry, condition))) {
    return { status: 'excluded', reason: 'condition-unresolved' }
  }
  const active: NarrativeEvidenceUse[] = []
  for (const item of candidate.evidence) {
    if (item.when) {
      // Conditions must use the same observable axis. Text labels or unrelated
      // predicates cannot erase a contradiction. Preserve inactive evidence for audit.
      if (!condition || condition.factId !== item.when.factId) return { status: 'excluded', reason: 'condition-unresolved' }
      if (!matches(registry, item.when)) continue
    }
    active.push(item)
  }
  if (active.some((item) => item.direction === 'opposes')) return { status: 'excluded', reason: 'conflict' }
  const ids = active.map((item) => item.factId)
  if (condition) ids.push(condition.factId)
  if (!periodResolved(registry, candidate, ids)) return { status: 'excluded', reason: 'period-unresolved' }
  const support = active.filter((item) => item.role !== 'context')
  const groups = registry.independentGroups(support.map((item) => item.factId))
  const hasStrong = support.some((item) => item.weight === 'strong')
  if (!hasStrong && groups.length < 2) return { status: 'excluded', reason: 'weak' }
  const confidence = hasStrong && groups.length >= 2 ? 'strong' : 'medium'
  const copy = structuredClone(candidate)
  const [first, ...rest] = copy.evidence
  return {
    status: 'accepted', independentGroups: groups.length,
    claim: { ...copy, evidence: [first, ...rest], confidence },
  }
}
