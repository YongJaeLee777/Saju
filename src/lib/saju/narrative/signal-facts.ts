import type { RootPillar, TenGod } from '../types'
import type { NarrativeEvidenceRegistry } from './evidence'
import type { NarrativePosition, NarrativeRelationKind, NarrativeSignalCode, NarrativeTenGodGroup } from './types'

export const GROUPS: readonly NarrativeTenGodGroup[] = ['peers', 'resource', 'output', 'wealth', 'officer']
export const GROUP_POLICY: Record<NarrativeTenGodGroup, {
  code: NarrativeSignalCode; strengthPath: string; positiveSide: string; shadowSide: string
}> = {
  peers: { code: 'autonomy_coordination_focus', strengthPath: 'support.sameElement',
    positiveSide: 'autonomy_with_coordination', shadowSide: 'competing_preferences' },
  resource: { code: 'preparation_analysis_focus', strengthPath: 'support.resourceElement',
    positiveSide: 'preparation_depth', shadowSide: 'extended_preparation' },
  output: { code: 'expression_production_focus', strengthPath: 'drain.outputElement',
    positiveSide: 'productive_expression', shadowSide: 'dispersed_expression' },
  wealth: { code: 'resource_realization_focus', strengthPath: 'drain.wealthElement',
    positiveSide: 'deliberate_resource_choices', shadowSide: 'competing_resource_priorities' },
  officer: { code: 'responsibility_structure_focus', strengthPath: 'drain.officerElement',
    positiveSide: 'responsibility_organization', shadowSide: 'rigid_role_expectations' },
}
const TEN_GOD_GROUP: Record<TenGod, NarrativeTenGodGroup> = {
  비견: 'peers', 겁재: 'peers', 정인: 'resource', 편인: 'resource', 식신: 'output', 상관: 'output',
  정재: 'wealth', 편재: 'wealth', 정관: 'officer', 편관: 'officer',
}
const PILLARS: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

export interface GroupObservation extends NarrativePosition {
  readonly group: NarrativeTenGodGroup
  readonly factId: string
}
export interface ExposureObservation {
  readonly group: NarrativeTenGodGroup
  readonly factId: string
}
export interface RelationObservation {
  readonly kind: NarrativeRelationKind
  readonly factId: string
  readonly pillars: readonly RootPillar[]
}

/** Project existing, position-specific ten gods. The day master is never a peer count. */
export function groupObservations(registry: NarrativeEvidenceRegistry): GroupObservation[] {
  return PILLARS.flatMap((pillar) => {
    const gods = registry.context.natal.tenGods[pillar]
    if (!gods) return []
    return (['stem', 'branch'] as const).flatMap((position) => {
      const god = gods[position]
      if (god === '일간' || (pillar === 'day' && position === 'stem')) return []
      return [{ pillar, position, group: TEN_GOD_GROUP[god],
        factId: registry.register({ source: 'natal', path: `tenGods.${pillar}.${position}` }).id }]
    })
  })
}

/** Exposure is an exact existing match, not an inference about public/private selves. */
export function exposureObservations(registry: NarrativeEvidenceRegistry): ExposureObservation[] {
  const unique = new Map<string, ExposureObservation>()
  registry.context.analysis.exposure.findings.forEach((finding, index) => {
    finding.exposedPillars.forEach((pillar, exposedIndex) => {
      if (pillar === 'day') return
      const god = registry.context.natal.tenGods[pillar]?.stem
      if (!god || god === '일간') return
      const fact = registry.register({ source: 'analysis', path: `exposure.findings.${index}.exposedPillars.${exposedIndex}` })
      const key = JSON.stringify([TEN_GOD_GROUP[god], registry.rootFactIds(fact.id)])
      if (!unique.has(key)) unique.set(key, { group: TEN_GOD_GROUP[god], factId: fact.id })
    })
  })
  return [...unique.entries()].sort(([a], [b]) => compare(a, b)).map(([, finding]) => finding)
}

/** Duplicate entries/types sharing endpoints never become additional occurrences. */
export function relationObservations(registry: NarrativeEvidenceRegistry): RelationObservation[] {
  const unique = new Map<string, RelationObservation>()
  const add = (kind: NarrativeRelationKind, path: string, pillars: readonly RootPillar[]) => {
    const fact = registry.register({ source: 'analysis', path })
    const key = JSON.stringify([kind, registry.rootFactIds(fact.id)])
    if (!unique.has(key)) unique.set(key, { kind, factId: fact.id, pillars: [...new Set(pillars)].sort(compare) })
  }
  for (const [collection, kind] of [
    ['branchClashes', 'clash'], ['branchCombinations', 'combination'],
    ['branchBreaks', 'break'], ['branchHarms', 'harm'],
  ] as const) {
    registry.context.analysis[collection].forEach((finding, index) => add(kind, `${collection}.${index}`, finding.pillars))
  }
  registry.context.analysis.branchPunishments.findings.forEach((finding, index) =>
    add('punishment', `branchPunishments.findings.${index}`, finding.pillars))
  return [...unique.entries()].sort(([a], [b]) => compare(a, b)).map(([, finding]) => finding)
}
