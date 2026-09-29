import { describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import type { SajuInput } from '../types'
import { NarrativeEvidenceRegistry } from './evidence'
import { buildNarrativePlan } from './plan'

vi.mock('astro:env/server', () => ({}))

const now = new Date('2026-09-13T00:00:00+09:00')
const input = (birthDate: string, birthTime: string | null = '13:04'): SajuInput => ({
  birthDate, birthTime, gender: 'female', calendarType: 'solar', isLeapMonth: false,
})

describe('core metaphor v1 from existing calculated facts', () => {
  it('provides ten distinct material images with the observed day stem polarity', () => {
    const cases = [
      ['1970-01-14', '갑', 'standing_tree', 'yang'],
      ['1970-05-05', '을', 'twining_vine', 'yin'],
      ['1970-01-26', '병', 'daylight', 'yang'],
      ['1970-01-17', '정', 'lamplight', 'yin'],
      ['1970-02-17', '무', 'mountain_ground', 'yang'],
      ['1970-02-08', '기', 'garden_soil', 'yin'],
      ['1970-01-20', '경', 'rough_metal', 'yang'],
      ['1970-01-11', '신', 'polished_metal', 'yin'],
      ['1970-02-11', '임', 'river_current', 'yang'],
      ['1970-01-23', '계', 'rainwater', 'yin'],
    ] as const
    const materials = new Set<string>()
    for (const [birthDate, stem, materialCode, polarity] of cases) {
      const context = buildResultNarrativeContext(input(birthDate), now)
      expect(context.natal.day.stem).toBe(stem)
      const motif = buildNarrativePlan(context).coreMetaphor
      expect(motif).toMatchObject({ kind: 'narrative-framing', dayStem: stem, materialCode, polarity })
      materials.add(motif!.materialCode)
    }
    expect(materials.size).toBe(10)
  })

  it('distinguishes the same day stem in different verified environments', () => {
    const first = buildResultNarrativeContext(input('1970-01-11'), now)
    const second = buildResultNarrativeContext(input('1970-03-02'), now)
    expect(first.natal.day.stem).toBe(second.natal.day.stem)
    const supported = buildNarrativePlan(first).coreMetaphor
    const demanded = buildNarrativePlan(second).coreMetaphor
    expect(supported).toMatchObject({ mode: 'contextual', materialCode: 'polished_metal',
      environmentCode: 'support_reinforced', methodologyVersion: 'core-metaphor-v1' })
    expect(demanded).toMatchObject({ mode: 'contextual', materialCode: 'polished_metal',
      environmentCode: 'demand_counterposed', methodologyVersion: 'core-metaphor-v1' })
    expect(supported?.code).not.toBe(demanded?.code)
    const plan = buildNarrativePlan(first)
    const references = new Map(plan.evidence?.map((fact) => [fact.id, `${fact.source}.${fact.path}`]))
    const paths = new Set(plan.coreMetaphor?.evidence.map((use) => references.get(use.factId)))
    expect(plan.coreMetaphor?.evidence.length).toBeGreaterThan(0)
    expect(plan.coreMetaphor?.evidence.every((use) => references.has(use.factId))).toBe(true)
    for (const path of ['natal.day.stem', 'natal.elements.day.stem', 'analysis.seasonal.relation',
      'analysis.surfaceCounts', 'analysis.hiddenCounts', 'strengthFacts.support', 'strengthFacts.drain',
      'strength.level', 'analysis.roots.hasRoot', 'analysis.exposure.hasExposure']) expect(paths.has(path)).toBe(true)
  })

  it('uses primaryTension only when the selected metaphor has one', () => {
    const context = buildResultNarrativeContext(input('1998-02-08'), now)
    const plan = buildNarrativePlan(context)
    expect(plan.primaryTension?.code).toBe('preparation_expression_tension')
    expect(plan.coreMetaphor?.tensionCode).toBe(plan.primaryTension?.code)
    expect(plan.coreMetaphor?.closingMotif).toEqual({ referenceCode: plan.coreMetaphor?.code,
      mode: 'material_environment_tension' })
    const metaphorFacts = new Set(plan.coreMetaphor?.evidence.map((use) => use.factId))
    expect(plan.primaryTension?.evidence.every((use) => metaphorFacts.has(use.factId))).toBe(true)
    const withoutTension = buildNarrativePlan(buildResultNarrativeContext(input('1970-01-11'), now)).coreMetaphor
    expect(withoutTension?.tensionCode).toBeUndefined()
    expect(withoutTension?.closingMotif.mode).toBe('material_environment')
  })

  it('keeps one dependent lineage Medium even with copied counts and strength context', () => {
    const context = buildResultNarrativeContext(input('1971-06-11', null), now)
    const plan = buildNarrativePlan(context)
    const metaphor = plan.coreMetaphor
    expect(metaphor?.confidence).toBe('medium')
    const registry = new NarrativeEvidenceRegistry(context)
    for (const fact of plan.evidence ?? []) registry.register({ source: fact.source, path: fact.path })
    const support = metaphor?.evidence.filter((use) => use.role !== 'context') ?? []
    expect(registry.independentGroups(support.map((use) => use.factId))).toHaveLength(1)
    expect(metaphor?.evidence.some((use) => use.role === 'context'
      && plan.evidence?.some((fact) => fact.id === use.factId && fact.source === 'strength'))).toBe(true)
    context.strength.confidence = 'high'
    expect(buildNarrativePlan(context).coreMetaphor?.confidence).toBe('medium')
  })

  it('keeps conflicting environment base-only even with primaryTension, preserving allocation/report', () => {
    const context = buildResultNarrativeContext(input('1973-11-13'), now)
    const report = buildResultReportFromContext(context)
    const plan = buildNarrativePlan(context)
    expect(plan.primaryTension?.code).toBe('autonomy_structure_tension')
    expect(plan.coreMetaphor).toMatchObject({ kind: 'narrative-framing', mode: 'base', materialCode: 'rainwater',
      closingMotif: { mode: 'material_only' } })
    expect(plan.coreMetaphor?.environmentCode).toBeUndefined()
    expect(plan.coreMetaphor?.tensionCode).toBeUndefined()
    expect(plan.coreMetaphor?.confidence).toBeUndefined()
    expect(plan.coreMetaphor?.positiveMeaning).toBeUndefined()
    expect(plan.coreMetaphor?.shadowMeaning).toBeUndefined()
    expect(plan.coreMetaphor?.evidence.every((use) => use.role === 'context')).toBe(true)
    expect(buildNarrativePlan(context)).toEqual(plan)
    expect(buildResultReportFromContext(context)).toEqual(report)
    const bodyCodes = [plan.primaryTension, ...(plan.socialSelf ?? []), ...(plan.privateSelf ?? []),
      ...(plan.relationship ?? []), ...(plan.work ?? []), ...(plan.recurringPattern ?? []),
      ...(plan.hiddenStrength ?? [])].filter((claim) => claim !== undefined).map((claim) => claim.code)
    expect(new Set(bodyCodes).size).toBe(bodyCodes.length)
  })
})
