import { assessNarrativeClaim } from './claims'
import { hasPeriod } from './context'
import type { NarrativeEvidenceRegistry } from './evidence'
import type { DaewoonCycle, TenGod } from '../types'
import type {
  NarrativeClaimCandidate, NarrativeEvidenceUse, NarrativeFactReference, NarrativePeriod,
  NarrativeTemporalClaim, NarrativeTemporalTheme,
} from './types'

const GROUP: Record<TenGod, NarrativeTemporalTheme> = {
  비견: 'peers', 겁재: 'peers', 편인: 'resource', 정인: 'resource',
  식신: 'output', 상관: 'output', 편재: 'wealth', 정재: 'wealth',
  편관: 'officer', 정관: 'officer',
}
type Slot = 'stem' | 'branch'
type PeriodFact = Pick<DaewoonCycle, 'stem' | 'branch' | 'stemTenGod' | 'branchTenGod' | 'startDateTime' | 'endDateTime'>

function period(value: PeriodFact): NarrativePeriod | undefined {
  return hasPeriod(value) ? { startDateTime: value.startDateTime, endDateTime: value.endDateTime } : undefined
}

function use(registry: NarrativeEvidenceRegistry, source: NarrativeFactReference['source'], path: string,
  weight: 'strong' | 'weak', role: 'support' | 'context' = 'support'): NarrativeEvidenceUse {
  return { factId: registry.register({ source, path }).id, direction: 'supports', weight,
    role, ruleId: 'temporal-structural-v1' }
}

function observedContext(registry: NarrativeEvidenceRegistry, scope: 'daewoon' | 'annual'): NarrativeEvidenceUse[] {
  const { context } = registry
  const result: NarrativeEvidenceUse[] = []
  const add = (source: NarrativeFactReference['source'], path: string) => {
    const fact = registry.register({ source, path })
    // A 2026 annual finding may cross a daewoon boundary; do not attach it
    // unless its whole period covers the phase being described.
    const target = context.luck[scope]
    if (hasPeriod(target) && registry.collect([fact.id]).every((ancestor) => ancestor.scope === 'natal'
      || (hasPeriod(ancestor.period) && Date.parse(ancestor.period.startDateTime) <= Date.parse(target.startDateTime)
        && Date.parse(target.endDateTime) <= Date.parse(ancestor.period.endDateTime)))) {
      result.push({ factId: fact.id, direction: 'supports', weight: 'weak', role: 'context', ruleId: 'temporal-observed-context-v1' })
    }
  }
  for (const slot of ['stem', 'branch'] as const) {
    if (context.flow[scope]) add('flow', `${scope}.${slot}TenGod`)
  }
  for (const collection of ['stemCombinations', 'branchClashes', 'branchCombinations',
    'branchPunishments', 'branchBreaks', 'branchHarms'] as const) {
    for (const [index, finding] of context.interactions[collection].entries()) {
      if ([finding.left.source.source, finding.right.source.source].includes(scope)) add('interactions', `${collection}.${index}`)
    }
  }
  for (const pillar of ['dayStem', 'dayBranch', 'monthBranch'] as const) {
    context.keyPillars[pillar].findings.forEach((finding, index) => {
      if (finding.externalSource === scope) add('keyPillars', `${pillar}.findings.${index}`)
    })
  }
  return result
}

function accepted(registry: NarrativeEvidenceRegistry, candidate: NarrativeClaimCandidate,
  fields: Pick<NarrativeTemporalClaim, 'phaseCode' | 'activatedThemes' | 'period' | 'changeDirection' | 'changeTheme' | 'annualTargetYear'>): NarrativeTemporalClaim | undefined {
  if (!candidate.context?.period) return undefined
  const assessed = assessNarrativeClaim(registry, candidate)
  return assessed.status === 'accepted' ? { ...assessed.claim, ...fields,
    temporalMethodologyVersion: 'narrative-temporal-v1', context: { ...candidate.context, period: candidate.context.period } } : undefined
}

function phase(registry: NarrativeEvidenceRegistry, source: 'daewoon' | 'annual'): NarrativeTemporalClaim[] {
  const fact = registry.context.luck[source]
  if (!fact) return []
  const targetPeriod = period(fact)
  if (!targetPeriod || (source === 'daewoon' && registry.context.timing.daewoon !== 'resolved')) return []
  const groups = [...new Set([GROUP[fact.stemTenGod], GROUP[fact.branchTenGod]])]
  const extra = observedContext(registry, source)
  return groups.flatMap((group) => {
    const slots = (['stem', 'branch'] as const).filter((slot) => GROUP[fact[`${slot}TenGod`]] === group)
    const evidence = slots.flatMap((slot) => [
      use(registry, source, slot, 'strong'), use(registry, source, `${slot}TenGod`, 'weak', 'context'),
    ]).concat(extra)
    const code = source === 'annual' ? `annual_target_${group}_emphasis` : `current_daewoon_${group}_emphasis`
    const candidate: NarrativeClaimCandidate = {
      code, positiveSide: `${group}_phase_option`, shadowSide: `${group}_phase_constraint`, evidence,
      context: { scope: source, period: targetPeriod, temporalRole: source === 'annual' ? 'target' : 'current' },
    }
    const claim = accepted(registry, candidate, {
      phaseCode: source === 'annual' ? 'annual_target_phase' : 'daewoon_phase',
      activatedThemes: [group], period: targetPeriod,
      ...(source === 'annual' ? { annualTargetYear: registry.context.luck.annual!.year } : {}),
    })
    return claim ? [claim] : []
  })
}

function transition(registry: NarrativeEvidenceRegistry, role: 'past' | 'future',
  target: DaewoonCycle, comparison: DaewoonCycle, targetIndex: number, comparisonIndex: number): NarrativeTemporalClaim[] {
  const targetPeriod = period(target)
  const comparisonPeriod = period(comparison)
  if (!targetPeriod || !comparisonPeriod) return []
  const now = Date.parse(registry.context.referenceInstant)
  if (role === 'past' ? Date.parse(targetPeriod.endDateTime) !== Date.parse(comparisonPeriod.startDateTime)
    || Date.parse(targetPeriod.endDateTime) > now
    : Date.parse(comparisonPeriod.endDateTime) !== Date.parse(targetPeriod.startDateTime)
      || Date.parse(targetPeriod.startDateTime) <= now) return []
  const targetGroups = [GROUP[target.stemTenGod], GROUP[target.branchTenGod]]
  const comparisonGroups = [GROUP[comparison.stemTenGod], GROUP[comparison.branchTenGod]]
  const introduced = [...new Set(targetGroups.filter((group) => !comparisonGroups.includes(group)))]
  const receded = [...new Set(comparisonGroups.filter((group) => !targetGroups.includes(group)))]
  const changes = [
    ...introduced.map((group) => ({ group, direction: 'introduced' as const })),
    ...(role === 'future' ? receded.map((group) => ({ group, direction: 'receded' as const })) : []),
  ]
  // One ranked direction per adjacent pair. A repeated group alone is not a change.
  return changes.slice(0, 1).flatMap(({ group, direction }) => {
    const targetSlot: Slot = targetGroups.includes(group) ? targetGroups[0] === group ? 'stem' : 'branch' : 'stem'
    const comparisonSlot: Slot = comparisonGroups.includes(group) ? comparisonGroups[0] === group ? 'stem' : 'branch' : 'stem'
    const targetPrefix = `cycles.${targetIndex}`
    const comparisonPrefix = `cycles.${comparisonIndex}`
    const evidence = [
      use(registry, 'daewoonResult', `${targetPrefix}.${targetSlot}`, 'weak'),
      use(registry, 'daewoonResult', `${comparisonPrefix}.${comparisonSlot}`, 'weak'),
      ...(['stem', 'branch'] as const).flatMap((slot) => [
        use(registry, 'daewoonResult', `${targetPrefix}.${slot}TenGod`, 'weak', 'context'),
        use(registry, 'daewoonResult', `${comparisonPrefix}.${slot}TenGod`, 'weak', 'context'),
      ]),
    ]
    const candidate: NarrativeClaimCandidate = {
      code: `${role}_${group}_${direction}`, positiveSide: `${group}_transition_option`,
      shadowSide: `${group}_transition_constraint`, evidence,
      context: { scope: 'daewoon', period: targetPeriod, comparisonPeriod, temporalRole: role },
    }
    const claim = accepted(registry, candidate, { phaseCode: 'daewoon_transition',
      activatedThemes: direction === 'introduced' ? [group] : [], changeTheme: group,
      changeDirection: direction, period: targetPeriod })
    return claim ? [claim] : []
  })
}

/** Uses selected luck and already calculated cycles; never reruns an analyzer. */
export function buildTemporalNarrative(registry: NarrativeEvidenceRegistry): {
  past?: readonly NarrativeTemporalClaim[]; current?: readonly NarrativeTemporalClaim[]; future?: readonly NarrativeTemporalClaim[]
} {
  const { context } = registry
  const current: NarrativeTemporalClaim[] = []
  const annual = phase(registry, 'annual')
  if (context.timing.daewoon === 'resolved') current.push(...phase(registry, 'daewoon'))
  current.push(...annual)
  const cycles = context.daewoonResult.cycles
  const index = cycles.indexOf(context.luck.daewoon!)
  const past = context.timing.daewoon === 'resolved' && index > 0
    ? transition(registry, 'past', cycles[index - 1], cycles[index], index - 1, index) : []
  const future = context.timing.daewoon === 'resolved' && index >= 0 && index + 1 < cycles.length
    ? transition(registry, 'future', cycles[index + 1], cycles[index], index + 1, index) : []
  return { ...(past.length ? { past } : {}), ...(current.length ? { current } : {}),
    ...(future.length ? { future } : {}) }
}
