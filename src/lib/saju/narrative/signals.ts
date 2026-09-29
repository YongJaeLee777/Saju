import { assessNarrativeClaim } from './claims'
import type { NarrativeEvidenceRegistry } from './evidence'
import {
  GROUPS, GROUP_POLICY, compare, exposureObservations, groupObservations, relationObservations,
  type ExposureObservation, type GroupObservation,
} from './signal-facts'
import type {
  NarrativeEvidenceUse, NarrativeSignal, NarrativeSignalCode, NarrativeTenGodGroup,
} from './types'

const version = 'narrative-signals-v1'
const use = (factId: string, weight: NarrativeEvidenceUse['weight'] = 'weak', role: NarrativeEvidenceUse['role'] = 'support'): NarrativeEvidenceUse => ({
  factId, weight, role, direction: 'supports', ruleId: version,
})
const supportIds = (signal: NarrativeSignal) => signal.evidence.filter((item) => item.role !== 'context').map((item) => item.factId)
const isStrong = (registry: NarrativeEvidenceRegistry, signal: NarrativeSignal) => {
  const assessment = assessNarrativeClaim(registry, signal)
  return assessment.status === 'accepted' && assessment.claim.confidence === 'strong'
}

/** A repeated pattern is one strong rule observation (at least two different
 * pillars plus matching surface counts). Its ten-god dependencies still merge
 * through the day master, so repetition alone is at most Medium. Only a disjoint
 * exposure witness can supply a second independent structural observation.
 */
function repeatedMode(
  registry: NarrativeEvidenceRegistry, group: NarrativeTenGodGroup,
  members: readonly GroupObservation[], exposures: readonly ExposureObservation[], visibleOnly = false,
): NarrativeSignal | undefined {
  const observed = members.filter((member) => member.group === group && (!visibleOnly || member.position === 'stem'))
  if (new Set(observed.map((member) => member.pillar)).size < 2) return
  const policy = GROUP_POLICY[group]
  const surface = registry.register({ source: 'strengthFacts', path: `${policy.strengthPath}.surface` })
  if (typeof surface.value !== 'number' || surface.value - (group === 'peers' ? 1 : 0) < 2) return
  const matching = exposures.filter((exposure) => exposure.group === group)
  const choices: { pair: readonly [GroupObservation, GroupObservation]; exposure?: ExposureObservation; independent: boolean }[] = []
  observed.forEach((first, index) => observed.slice(index + 1).forEach((second) => {
    if (first.pillar === second.pillar) return
    const anchors = [first.factId, second.factId]
    const independent = matching.find((exposure) => registry.independentGroups([...anchors, exposure.factId]).length
      > registry.independentGroups(anchors).length)
    choices.push({ pair: [first, second], exposure: independent ?? matching[0], independent: Boolean(independent) })
  }))
  choices.sort((a, b) => Number(b.independent) - Number(a.independent)
    || compare(a.pair.map((member) => member.factId).join('|'), b.pair.map((member) => member.factId).join('|')))
  const selected = choices[0]
  if (!selected || (visibleOnly && !selected.independent)) return
  const anchors = selected.pair.map((member) => member.factId)
  const evidence = observed.map((member) => use(member.factId,
    member.factId === anchors[0] ? 'strong' : 'weak', anchors.includes(member.factId) ? 'support' : 'context'))
  evidence.push(use(surface.id, 'weak', 'context'))
  if (selected.exposure) evidence.push(use(selected.exposure.factId,
    selected.independent ? 'strong' : 'weak', selected.independent ? 'support' : 'context'))
  if (group === 'peers' && registry.context.analysis.roots.hasRoot) {
    evidence.push(use(registry.register({ source: 'analysis', path: 'roots.hasRoot' }).id, 'weak', 'context'))
  }
  const code = visibleOnly ? group === 'output' ? 'visible_expression_pattern' : 'visible_responsibility_pattern' : policy.code
  return {
    methodologyVersion: version, code, meaningKey: `working-mode:${group}`,
    targets: [...(visibleOnly ? ['socialSelf' as const] : []), 'work', ...(selected.independent ? ['hiddenStrength' as const] : [])],
    specificity: visibleOnly ? 4 : 2,
    evidence, positiveSide: policy.positiveSide, shadowSide: policy.shadowSide,
    condition: { code: 'repeated_positions_with_surface_support', factId: surface.id, equals: surface.value },
    context: { scope: 'natal' },
    attributes: {
      groups: [group], positions: observed.map(({ pillar, position }) => ({ pillar, position })),
      basis: visibleOnly ? 'visible-repetition-exposure' : 'position-repetition',
      ...(selected.independent ? { independentCorroboration: 'exposure' as const } : {}),
      interpretationLimit: 'structural-candidate',
    },
  }
}

/** Existing natal facts only. No calendar work, text, scenes, or time forecasts. */
export function buildNarrativeSignals(registry: NarrativeEvidenceRegistry): readonly NarrativeSignal[] {
  const members = groupObservations(registry)
  const exposures = exposureObservations(registry)
  const relations = relationObservations(registry)
  const signals: NarrativeSignal[] = []
  const modes = new Map<NarrativeTenGodGroup, NarrativeSignal>()
  for (const group of GROUPS) {
    const mode = repeatedMode(registry, group, members, exposures)
    if (mode) { modes.set(group, mode); signals.push(mode) }
    if (group === 'output' || group === 'officer') {
      const visible = repeatedMode(registry, group, members, exposures, true)
      if (visible) signals.push(visible)
    }
  }

  for (const [left, right, code] of [
    ['resource', 'output', 'preparation_expression_tension'],
    ['peers', 'officer', 'autonomy_structure_tension'],
  ] as const) {
    const first = modes.get(left)
    const second = modes.get(right)
    if (!first || !second || !isStrong(registry, first) || !isStrong(registry, second)) continue
    const tension: NarrativeSignal = {
      methodologyVersion: version, code, meaningKey: `tension:${left}:${right}`, targets: ['primaryTension'], specificity: 5,
      evidence: [...first.evidence, ...second.evidence], context: { scope: 'natal' },
      positiveSide: 'coordination_of_coexisting_modes', shadowSide: 'competing_mode_priorities',
      attributes: { groups: [left, right], positions: [...first.attributes.positions, ...second.attributes.positions],
        basis: 'coexisting-strong-patterns', interpretationLimit: 'structural-candidate' },
    }
    // Combining overlapping sides must not promote the tension beyond its actual lineage.
    if (isStrong(registry, tension)) signals.push(tension)
  }

  // Compare channels within their own integer counts, never as strength percentages.
  const { support, drain } = registry.context.strengthFacts
  const surfaceSupport = Math.max(0, support.sameElement.surface - 1) + support.resourceElement.surface
  const surfaceDrain = drain.outputElement.surface + drain.wealthElement.surface + drain.officerElement.surface
  const hiddenSupport = support.sameElement.hidden + support.resourceElement.hidden
  const hiddenDrain = drain.outputElement.hidden + drain.wealthElement.hidden + drain.officerElement.hidden
  const contrast = surfaceDrain > surfaceSupport && hiddenSupport > hiddenDrain ? 'surface-drain-hidden-support'
    : surfaceSupport > surfaceDrain && hiddenDrain > hiddenSupport ? 'surface-support-hidden-drain' : undefined
  if (contrast && registry.context.analysis.roots.roots.length > 0) {
    const groups: readonly NarrativeTenGodGroup[] = contrast === 'surface-drain-hidden-support' ? ['output', 'wealth', 'officer'] : ['peers', 'resource']
    const mode = groups.map((group) => modes.get(group)).find((item) => item !== undefined)
    if (mode) {
      const countEvidence = GROUPS.flatMap((group) => ['surface', 'hidden'].map((channel) =>
        use(registry.register({ source: 'strengthFacts', path: `${GROUP_POLICY[group].strengthPath}.${channel}` }).id, 'weak', 'context')))
      const root = registry.register({ source: 'analysis', path: 'roots.roots.0' })
      signals.push({
        methodologyVersion: version, code: 'surface_support_contrast', meaningKey: 'surface-hidden-contrast', targets: ['privateSelf'], specificity: 5,
        evidence: [...mode.evidence, ...countEvidence, use(root.id, 'weak', 'context')], context: { scope: 'natal' },
        positiveSide: 'surface_hidden_coordination', shadowSide: 'surface_hidden_demand_mismatch',
        exclusive: { axis: 'surface-hidden-direction', value: contrast },
        attributes: { ...mode.attributes, basis: 'surface-hidden-contrast', contrast },
      })
    }
  }

  const relationshipCodes: Partial<Record<NarrativeTenGodGroup, NarrativeSignalCode>> = {
    output: 'relationship_expression_adjustment', peers: 'relationship_boundary_adjustment', officer: 'relationship_responsibility_adjustment',
  }
  for (const group of GROUPS) {
    const mode = modes.get(group)
    if (!mode) continue
    const code = relationshipCodes[group]
    const anchors = supportIds(mode)
    const dayRelation = relations.find((relation) => relation.pillars.includes('day')
      && registry.independentGroups([...anchors, relation.factId]).length > registry.independentGroups(anchors).length)
    if (code && dayRelation) signals.push({
      methodologyVersion: version, code, meaningKey: `relationship-mode:${group}`, targets: ['relationship'], specificity: 4,
      evidence: [...mode.evidence, use(dayRelation.factId)], context: { scope: 'natal' },
      positiveSide: 'relationship_mode_coordination', shadowSide: 'relationship_mode_friction',
      attributes: { ...mode.attributes, basis: 'day-branch-relation-with-pattern',
        relationKinds: [dayRelation.kind], relationPillars: [dayRelation.pillars] },
    })

    for (const kind of ['clash', 'punishment', 'break', 'harm'] as const) {
      const matching = relations.filter((relation) => relation.kind === kind
        && members.some((member) => member.group === group && relation.pillars.includes(member.pillar)))
      const pair = matching.flatMap((first, index) => matching.slice(index + 1)
        .filter((second) => registry.independentGroups([first.factId, second.factId]).length === 2)
        .map((second) => [first, second] as const))[0]
      if (!pair) continue
      signals.push({
        methodologyVersion: version, code: 'recurring_coordination_tension', meaningKey: `recurring:${group}`,
        targets: ['recurringPattern'], specificity: 4,
        evidence: [...mode.evidence, ...pair.map((relation) => use(relation.factId))], context: { scope: 'natal' },
        positiveSide: 'repeated_coordination_review', shadowSide: 'repeated_coordination_friction',
        attributes: { ...mode.attributes, basis: 'independent-relation-recurrence',
          relationKinds: [kind], relationPillars: pair.map((relation) => relation.pillars) },
      })
    }
  }
  return signals.sort((a, b) => compare(a.code, b.code) || compare(a.meaningKey, b.meaningKey))
}
