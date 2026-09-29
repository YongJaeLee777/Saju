import { describe, expect, it } from 'vitest'
import { NarrativeEvidenceRegistry } from './evidence'
import { assessNarrativeClaim } from './claims'
import { buildNarrativeSignals } from './signals'
import { buildNarrativePlan } from './plan'
import { structuralContext } from './test-fixtures'

const visible = () => structuralContext(['병인', '병진', '갑오', '병신'])
const medium = () => structuralContext(['병인', '정유', '갑자', '임신'])
const insufficient = () => structuralContext(['경오', '무인', '갑자', null])

describe('natal Narrative SIGNAL v1', () => {
  it.each([
    { labels: ['갑신', '을유', '갑자', null] as const, code: 'autonomy_coordination_focus' },
    { labels: ['임신', '계유', '갑자', null] as const, code: 'preparation_analysis_focus' },
    { labels: ['병인', '정유', '갑자', null] as const, code: 'expression_production_focus' },
    { labels: ['무신', '기유', '갑자', null] as const, code: 'resource_realization_focus' },
    { labels: ['경신', '신유', '갑자', null] as const, code: 'responsibility_structure_focus' },
  ])('supports $code using existing ten-god positions and support/drain facts', ({ labels, code }) => {
    const plan = buildNarrativePlan(structuralContext(labels))
    expect(plan.work?.some((claim) => claim.code === code)).toBe(true)
    const claim = plan.work?.find((item) => item.code === code)
    expect(claim?.condition?.code).toBe('repeated_positions_with_surface_support')
    expect(plan.evidence?.some((fact) => fact.source === 'strengthFacts')).toBe(true)
  })

  it('does not treat two slots of one pillar as a repeated positional pattern', () => {
    expect(buildNarrativeSignals(new NarrativeEvidenceRegistry(structuralContext(['병오', '신해', '갑인', null])))).toEqual([])
  })

  it('combines repeated positions and a disjoint exposure into Strong', () => {
    const registry = new NarrativeEvidenceRegistry(visible())
    const signal = buildNarrativeSignals(registry).find((item) => item.code === 'visible_expression_pattern')!
    expect(signal).toBeDefined()
    expect(signal.attributes).toMatchObject({ groups: ['output'], independentCorroboration: 'exposure' })
    const support = signal.evidence.filter((item) => item.role !== 'context')
    expect(registry.independentGroups(support.map((item) => item.factId))).toHaveLength(2)
    expect(assessNarrativeClaim(registry, signal)).toMatchObject({ status: 'accepted', claim: { confidence: 'strong' } })
  })

  it('keeps a repeated but dependent pattern Medium and never promotes duplicate exposure', () => {
    const context = medium()
    context.analysis.exposure.findings.push(...structuredClone(context.analysis.exposure.findings))
    const registry = new NarrativeEvidenceRegistry(context)
    const signal = buildNarrativeSignals(registry).find((item) => item.code === 'expression_production_focus')!
    expect(signal).toBeDefined()
    expect(signal.attributes.independentCorroboration).toBeUndefined()
    expect(assessNarrativeClaim(registry, signal)).toMatchObject({ status: 'accepted', independentGroups: 1, claim: { confidence: 'medium' } })
    expect(buildNarrativePlan(context).socialSelf).toBeUndefined()
  })

  it('does not turn one ten god per family, a day-branch clash or legacy high into a trait', () => {
    const context = insufficient()
    expect(context.analysis.branchClashes.some((finding) => finding.pillars.includes('day'))).toBe(true)
    context.strength.confidence = 'high'
    context.strength.level = 'strong'
    const registry = new NarrativeEvidenceRegistry(context)
    expect(buildNarrativeSignals(registry)).toEqual([])
    const plan = buildNarrativePlan(context)
    for (const field of ['work', 'relationship', 'socialSelf', 'privateSelf', 'hiddenStrength', 'hook'] as const) expect(plan[field]).toBeUndefined()
  })

  it('requires independent day-branch relations and a repeated mode for relationship candidates', () => {
    const context = structuralContext(['병인', '정유', '갑자', '경오'])
    const registry = new NarrativeEvidenceRegistry(context)
    const signal = buildNarrativeSignals(registry).find((item) => item.code === 'relationship_expression_adjustment')!
    expect(signal).toBeDefined()
    expect(signal.attributes.relationPillars?.every((pillars) => pillars.includes('day'))).toBe(true)
    expect(signal.attributes.positions.length).toBeGreaterThanOrEqual(2)
    expect(buildNarrativePlan(context).relationship?.length).toBeGreaterThan(0)
  })

  it('does not equate year/month positions, hidden stems or a day/hour pair with public/private personality', () => {
    const context = medium()
    const plan = buildNarrativePlan(context)
    expect(context.natal.hiddenStems.day.length).toBeGreaterThan(0)
    expect(context.natal.hour.stem).not.toBeNull()
    expect(plan.socialSelf).toBeUndefined()
    expect(plan.privateSelf).toBeUndefined()
  })

  it('allows privateSelf only for a recorded surface/hidden contrast with a root and repeated mode', () => {
    const context = structuralContext(['병신', '정해', '갑인', '무진'])
    const plan = buildNarrativePlan(context)
    expect(plan.privateSelf).toHaveLength(1)
    expect(plan.privateSelf?.[0]).toMatchObject({ code: 'surface_support_contrast', attributes: {
      contrast: 'surface-drain-hidden-support', interpretationLimit: 'structural-candidate',
    } })
    context.analysis.roots = { hasRoot: false, roots: [] }
    expect(buildNarrativePlan(context).privateSelf).toBeUndefined()
  })

  it.each([
    { labels: ['신사', '병오', '무인', '경신'] as const, modes: ['preparation_analysis_focus', 'expression_production_focus'], tension: 'preparation_expression_tension' },
    { labels: ['신사', '병오', '경인', '경신'] as const, modes: ['autonomy_coordination_focus', 'responsibility_structure_focus'], tension: 'autonomy_structure_tension' },
  ])('creates $tension only when both modes and their combined evidence are Strong', ({ labels, modes, tension }) => {
    const context = structuralContext(labels)
    const registry = new NarrativeEvidenceRegistry(context)
    const signals = buildNarrativeSignals(registry)
    for (const code of modes) {
      const mode = signals.find((item) => item.code === code)!
      expect(assessNarrativeClaim(registry, mode)).toMatchObject({ status: 'accepted', claim: { confidence: 'strong' } })
    }
    expect(buildNarrativePlan(context).primaryTension).toMatchObject({ code: tension, confidence: 'strong' })
    expect(buildNarrativePlan(medium()).primaryTension).toBeUndefined()
  })

  it('keeps repeated positive structures without reusing their body claim as hiddenStrength', () => {
    const plan = buildNarrativePlan(visible())
    expect(plan.socialSelf?.[0]).toMatchObject({ code: 'visible_expression_pattern', confidence: 'strong',
      attributes: { independentCorroboration: 'exposure' } })
    expect(plan.hiddenStrength).toBeUndefined()
    expect(plan.hookPreviews?.some((preview) => preview.claimCode === 'visible_expression_pattern'
      && preview.owner === 'socialSelf')).toBe(true)
    expect(JSON.stringify(plan)).not.toMatch(/rare|rarity|percentile|희소|상위|결혼|이별|배우자|번아웃|돈을 잘/)
  })

  it('requires two independent relations of the same kind; duplicate or shared-endpoint findings do not count as recurrence', () => {
    const shared = structuralContext(['병자', '병오', '갑자', '무술'])
    expect(shared.analysis.branchClashes).toHaveLength(2)
    shared.analysis.branchClashes.push(...structuredClone(shared.analysis.branchClashes))
    expect(buildNarrativePlan(shared).recurringPattern).toBeUndefined()
    const independent = structuralContext(['병자', '병오', '갑인', '병신'])
    const plan = buildNarrativePlan(independent)
    expect(plan.recurringPattern?.length).toBeGreaterThan(0)
    expect(plan.recurringPattern?.every((claim) => claim.positiveSide && claim.shadowSide)).toBe(true)
    expect(plan.recurringPattern?.[0].attributes?.relationPillars).toHaveLength(2)
    expect(JSON.stringify(plan.recurringPattern)).not.toMatch(/eventCount|problemCount|times|횟수/)
  })

  it('returns identical plans, at most three different hook themes, and a complete evidence graph', () => {
    const context = structuralContext(['신사', '병오', '무인', '경신'])
    const before = structuredClone(context)
    const plan = buildNarrativePlan(context)
    expect(buildNarrativePlan(context)).toEqual(plan)
    expect(context).toEqual(before)
    expect(plan.hook?.length).toBeLessThanOrEqual(3)
    const themes = plan.hook?.flatMap((claim) => claim.attributes?.groups ?? []) ?? []
    expect(new Set(themes).size).toBe(themes.length)
    const facts = new Set(plan.evidence?.map((fact) => fact.id))
    for (const fact of plan.evidence ?? []) {
      expect(fact.scope).toBe('natal')
      for (const ancestor of fact.derivedFrom ?? []) expect(facts.has(ancestor)).toBe(true)
    }
    const claims = [plan.primaryTension, ...(plan.hook ?? []), ...(plan.work ?? []), ...(plan.hiddenStrength ?? [])].filter((claim) => claim !== undefined)
    for (const claim of claims) for (const item of claim.evidence) expect(facts.has(item.factId)).toBe(true)
    for (const field of ['past', 'current', 'future'] as const) expect(plan[field]).toBeUndefined()
  })
})
