import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext } from '../server/result-page'
import { NarrativeEvidenceRegistry } from './evidence'
import { assessNarrativeClaim } from './claims'
import type { NarrativeClaimCandidate, NarrativeContext, NarrativeEvidenceUse } from './types'

vi.mock('astro:env/server', () => ({}))

let context: NarrativeContext
beforeAll(() => {
  context = buildResultNarrativeContext({
    birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false,
  }, new Date('2026-09-13T00:00:00+09:00'))
})
const use = (factId: string, weight: NarrativeEvidenceUse['weight'] = 'strong'): NarrativeEvidenceUse => ({
  factId, weight, direction: 'supports', ruleId: 'test-rule',
})
const candidate = (evidence: readonly NarrativeEvidenceUse[]): NarrativeClaimCandidate => ({
  code: 'test-candidate', positiveSide: 'test-positive', evidence,
})
function observations() {
  const registry = new NarrativeEvidenceRegistry(context)
  return { registry,
    day: registry.register({ source: 'natal', path: 'day.stem' }),
    month: registry.register({ source: 'natal', path: 'month.branch' }),
  }
}

describe('narrative claim admission', () => {
  it.each([
    { weights: ['strong', 'strong'] as const, confidence: 'strong' },
    { weights: ['strong', 'weak'] as const, confidence: 'strong' },
    { weights: ['weak', 'weak'] as const, confidence: 'medium' },
  ])('independent $weights observations produce $confidence', ({ weights, confidence }) => {
    const { registry, day, month } = observations()
    expect(assessNarrativeClaim(registry, candidate([use(day.id, weights[0]), use(month.id, weights[1])]))).toMatchObject({
      status: 'accepted', independentGroups: 2, claim: { confidence },
    })
  })

  it('a single strong observation is medium; a single weak observation is excluded', () => {
    const { registry, day } = observations()
    expect(assessNarrativeClaim(registry, candidate([use(day.id)]))).toMatchObject({ status: 'accepted', claim: { confidence: 'medium' } })
    expect(assessNarrativeClaim(registry, candidate([use(day.id, 'weak')]))).toEqual({ status: 'excluded', reason: 'weak' })
  })

  it('duplicate or derived evidence cannot promote one observation to strong', () => {
    const { registry, month } = observations()
    const season = registry.register({ source: 'analysis', path: 'seasonal.season' })
    expect(assessNarrativeClaim(registry, candidate([use(month.id), use(month.id), use(season.id)]))).toMatchObject({
      status: 'accepted', independentGroups: 1, claim: { confidence: 'medium' },
    })
    expect(assessNarrativeClaim(registry, candidate([use(month.id, 'weak'), use(season.id, 'weak')]))).toEqual({ status: 'excluded', reason: 'weak' })
  })

  it('never converts the existing high confidence into Narrative Strong', () => {
    const registry = new NarrativeEvidenceRegistry({ ...context, strength: { ...context.strength, confidence: 'high' } })
    const legacy = registry.register({ source: 'strength', path: 'confidence' })
    expect(legacy.value).toBe('high')
    expect(assessNarrativeClaim(registry, candidate([use(legacy.id, 'weak')]))).toEqual({ status: 'excluded', reason: 'weak' })
  })

  it('excludes factless candidates, unknown evidence and unsupported contradictions', () => {
    const { registry, day, month } = observations()
    for (const evidence of [[], [use('missing')]]) {
      expect(assessNarrativeClaim(registry, candidate(evidence))).toEqual({ status: 'excluded', reason: 'invalid-evidence' })
    }
    const conflict = candidate([use(day.id), { ...use(month.id), direction: 'opposes' }])
    expect(assessNarrativeClaim(registry, conflict)).toEqual({ status: 'excluded', reason: 'conflict' })
    expect(assessNarrativeClaim(registry, { ...conflict, condition: { code: 'label-alone', factId: day.id, equals: String(day.value) } }))
      .toEqual({ status: 'excluded', reason: 'conflict' })
  })

  it('resolves only evidence explicitly scoped to a verified factual condition', () => {
    const { registry, day, month } = observations()
    const season = registry.register({ source: 'analysis', path: 'seasonal.season' })
    const condition = { code: 'winter-context', factId: season.id, equals: '겨울' }
    const input = { ...candidate([
      { ...use(day.id), when: condition },
      { ...use(month.id), direction: 'opposes' as const, when: { factId: season.id, equals: '여름' } },
    ]), condition }
    expect(assessNarrativeClaim(registry, input)).toMatchObject({ status: 'accepted', claim: { confidence: 'medium' } })
    expect(assessNarrativeClaim(registry, { ...input, condition: { ...condition, equals: '여름' } }))
      .toEqual({ status: 'excluded', reason: 'condition-unresolved' })
    expect(assessNarrativeClaim(registry, { ...input, condition: { ...condition, factId: 'invented' } }))
      .toEqual({ status: 'excluded', reason: 'condition-unresolved' })
    const unrelated = { ...input, evidence: [input.evidence[0], { ...input.evidence[1], when: { factId: day.id, equals: 'never' } }] }
    expect(assessNarrativeClaim(registry, unrelated)).toEqual({ status: 'excluded', reason: 'condition-unresolved' })
  })

  it('requires explicit periods and refuses to relabel fixed 2026 as current in 2029', () => {
    const registry = new NarrativeEvidenceRegistry({ ...context,
      referenceInstant: '2029-09-13T00:00:00Z', referenceDate: '2029-09-13', referenceYear: 2029,
    })
    const fact = registry.register({ source: 'annual', path: 'stem' })
    const input = candidate([use(fact.id)])
    expect(assessNarrativeClaim(registry, input)).toEqual({ status: 'excluded', reason: 'period-unresolved' })
    expect(assessNarrativeClaim(registry, { ...input, context: { scope: 'annual', period: fact.period, temporalRole: 'current' } }))
      .toEqual({ status: 'excluded', reason: 'period-unresolved' })
    expect(assessNarrativeClaim(registry, { ...input, context: { scope: 'annual', period: fact.period, temporalRole: 'target' } }))
      .toMatchObject({ status: 'accepted', claim: { confidence: 'medium' } })
  })

  it('blocks daewoon period claims when birth time is missing, even with supplied cycle data', () => {
    const registry = new NarrativeEvidenceRegistry({ ...context, hasBirthTime: false,
      timing: { ...context.timing, daewoon: 'birth-time-missing' },
    })
    const fact = registry.register({ source: 'daewoon', path: 'stem' })
    expect(assessNarrativeClaim(registry, { ...candidate([use(fact.id)]),
      context: { scope: 'daewoon', period: fact.period, temporalRole: 'current' },
    })).toEqual({ status: 'excluded', reason: 'period-unresolved' })
  })
})
