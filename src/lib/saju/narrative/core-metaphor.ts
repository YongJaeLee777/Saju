import type { FiveElement } from '../types'
import { assessNarrativeClaim } from './claims'
import type { NarrativeEvidenceRegistry } from './evidence'
import type {
  NarrativeAnchorCode, NarrativeBaseMotif, NarrativeClaim, NarrativeContext, NarrativeCoreMetaphor,
  NarrativeEnvironmentCode, NarrativeEvidenceUse, NarrativeMaterialCode,
} from './types'

const ELEMENT_MATERIAL: Record<FiveElement, string> = {
  목: 'wood', 화: 'fire', 토: 'earth', 금: 'metal', 수: 'water',
}
const BASE_MOTIF: Record<string, { materialCode: NarrativeMaterialCode; element: FiveElement; polarity: 'yang' | 'yin' }> = {
  갑: { materialCode: 'standing_tree', element: '목', polarity: 'yang' },
  을: { materialCode: 'twining_vine', element: '목', polarity: 'yin' },
  병: { materialCode: 'daylight', element: '화', polarity: 'yang' },
  정: { materialCode: 'lamplight', element: '화', polarity: 'yin' },
  무: { materialCode: 'mountain_ground', element: '토', polarity: 'yang' },
  기: { materialCode: 'garden_soil', element: '토', polarity: 'yin' },
  경: { materialCode: 'rough_metal', element: '금', polarity: 'yang' },
  신: { materialCode: 'polished_metal', element: '금', polarity: 'yin' },
  임: { materialCode: 'river_current', element: '수', polarity: 'yang' },
  계: { materialCode: 'rainwater', element: '수', polarity: 'yin' },
}
const version = 'core-metaphor-v1'
const use = (factId: string, weight: NarrativeEvidenceUse['weight'], role: NarrativeEvidenceUse['role'] = 'support'): NarrativeEvidenceUse => ({
  factId, weight, role, direction: 'supports', ruleId: version,
})

/** A structural motif only. Counts corroborate a seasonal relationship but
 * never become independent votes; observed year/hour positions can do so. */
export function buildCoreMetaphor(
  context: NarrativeContext, registry: NarrativeEvidenceRegistry, primaryTension?: NarrativeClaim,
): NarrativeCoreMetaphor {
  const { analysis, strengthFacts, strength, natal } = context
  const material = BASE_MOTIF[natal.day.stem]
  if (!material || material.element !== natal.elements.day.stem) throw new Error('Unsupported or inconsistent day stem material.')
  const baseCode = `base_${material.materialCode}`
  const base: NarrativeBaseMotif = {
    kind: 'narrative-framing', mode: 'base', code: baseCode,
    materialCode: material.materialCode, dayStem: natal.day.stem,
    dayElement: natal.elements.day.stem, polarity: material.polarity,
    evidence: [
      use(registry.register({ source: 'natal', path: 'day.stem' }).id, 'weak', 'context'),
      use(registry.register({ source: 'natal', path: 'elements.day.stem' }).id, 'weak', 'context'),
    ],
    closingMotif: { referenceCode: baseCode, mode: 'material_only' },
    methodologyVersion: version,
  }
  const { sameElement, resourceElement } = strengthFacts.support
  const { outputElement, wealthElement, officerElement } = strengthFacts.drain
  const supportSurface = Math.max(0, sameElement.surface - 1) + resourceElement.surface
  const demandSurface = outputElement.surface + wealthElement.surface + officerElement.surface
  const supportHidden = sameElement.hidden + resourceElement.hidden
  const demandHidden = outputElement.hidden + wealthElement.hidden + officerElement.hidden
  if (supportSurface === demandSurface) return base
  const surfaceDirection = supportSurface > demandSurface ? 'support' : 'demand'
  // Hidden distribution must not contradict the surface direction; one visible
  // element or the largest raw count cannot select an environment by itself.
  if (surfaceDirection === 'support' ? supportHidden < demandHidden : demandHidden < supportHidden) return base
  const seasonalSupport = ['same', 'generatesMe'].includes(analysis.seasonal.relation)
  const aligned = (surfaceDirection === 'support') === seasonalSupport
  if (aligned && ((surfaceDirection === 'support' && strength.level === 'weak')
    || (surfaceDirection === 'demand' && strength.level === 'strong'))) return base
  if (!aligned && strength.level !== 'balanced') return base
  const environmentCode: NarrativeEnvironmentCode = seasonalSupport
    ? aligned ? 'support_reinforced' : 'support_counterposed'
    : aligned ? 'demand_reinforced' : 'demand_counterposed'

  const supportingElements = new Set([sameElement.element, resourceElement.element])
  const matchesDirection = (element: FiveElement) => supportingElements.has(element) === (surfaceDirection === 'support')
  const alignedExposure = analysis.exposure.findings.findIndex((finding) => finding.exposedPillars.some((pillar) => {
    const element = natal.elements[pillar]?.stem
    return element !== undefined && matchesDirection(element)
  }))
  const anchorCode: NarrativeAnchorCode | undefined = analysis.roots.hasRoot ? 'root_observed'
    : alignedExposure >= 0 ? 'aligned_exposure_observed' : undefined
  if (!aligned && !anchorCode) return base

  const evidence: NarrativeEvidenceUse[] = [
    use(registry.register({ source: 'natal', path: 'day.stem' }).id, 'strong'),
    use(registry.register({ source: 'analysis', path: 'seasonal.relation' }).id, 'strong'),
  ]
  // At most one observation per extra pillar, so two slots of one pillar do
  // not masquerade as independent confirmation.
  for (const pillar of ['year', 'hour'] as const) {
    const elements = natal.elements[pillar]
    if (!elements) continue
    const position = (['stem', 'branch'] as const).find((part) => matchesDirection(elements[part]))
    if (position) evidence.push(use(registry.register({ source: 'natal', path: `elements.${pillar}.${position}` }).id, 'weak'))
  }
  evidence.push(use(registry.register({ source: 'natal', path: 'elements.day.stem' }).id, 'weak', 'context'))
  for (const path of ['surfaceCounts', 'hiddenCounts', 'seasonal.season', 'roots.hasRoot', 'exposure.hasExposure'] as const) {
    evidence.push(use(registry.register({ source: 'analysis', path }).id, 'weak', 'context'))
  }
  for (const path of ['support', 'drain'] as const) evidence.push(use(registry.register({ source: 'strengthFacts', path }).id, 'weak', 'context'))
  evidence.push(use(registry.register({ source: 'strength', path: 'level' }).id, 'weak', 'context'))
  if (anchorCode === 'root_observed') evidence.push(use(registry.register({ source: 'analysis', path: 'roots.roots.0' }).id, 'weak', 'context'))
  if (alignedExposure >= 0) evidence.push(use(registry.register({ source: 'analysis', path: `exposure.findings.${alignedExposure}` }).id, 'weak', 'context'))

  const tensionCode = primaryTension?.code === 'preparation_expression_tension' || primaryTension?.code === 'autonomy_structure_tension'
    ? primaryTension.code : undefined
  if (tensionCode && primaryTension) for (const item of primaryTension.evidence) {
    if (!evidence.some((existing) => existing.factId === item.factId)) evidence.push(use(item.factId, 'weak', 'context'))
  }
  const code = [ELEMENT_MATERIAL[natal.elements.day.stem], environmentCode,
    ...(anchorCode ? [anchorCode] : []), ...(tensionCode ? [tensionCode] : [])].join('_')
  const positiveMeaning = aligned ? 'coordinated_environmental_direction' : 'balancing_distinct_environmental_directions'
  const shadowMeaning = aligned ? 'directional_overconcentration' : 'competing_environmental_demands'
  const assessment = assessNarrativeClaim(registry, {
    code, evidence, positiveSide: positiveMeaning, shadowSide: shadowMeaning, context: { scope: 'natal' },
  })
  if (assessment.status !== 'accepted') return base
  return {
    ...base, mode: 'contextual', code, environmentCode,
    ...(anchorCode ? { anchorCode } : {}), ...(tensionCode ? { tensionCode } : {}),
    evidence: assessment.claim.evidence, confidence: assessment.claim.confidence,
    positiveMeaning, shadowMeaning,
    closingMotif: { referenceCode: code, mode: tensionCode ? 'material_environment_tension' : 'material_environment' },
  }
}
