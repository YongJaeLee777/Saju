import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext } from '../server/result-page'
import { NarrativeEvidenceRegistry } from './evidence'
import type { NarrativeContext } from './types'

vi.mock('astro:env/server', () => ({}))

let context: NarrativeContext
beforeAll(() => {
  context = buildResultNarrativeContext({
    birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false,
  }, new Date('2026-09-13T00:00:00+09:00'))
})

describe('narrative evidence and lineage', () => {
  it('reads real values and creates stable ids independent of registration order', () => {
    const first = new NarrativeEvidenceRegistry(context)
    const second = new NarrativeEvidenceRegistry(context)
    const month = first.register({ source: 'natal', path: 'month.branch' })
    second.register({ source: 'natal', path: 'day.stem' })
    expect(second.register({ source: 'natal', path: 'month.branch' })).toEqual(month)
    expect(first.register({ source: 'natal', path: 'month.branch' })).toBe(month)
    expect(month).toMatchObject({ value: context.natal.month.branch, scope: 'natal', analyzer: 'calculateSaju', calculationVersion: 'unversioned' })
    expect(first.register({ source: 'strength', path: 'level' }).calculationVersion).toBe('v1')
  })

  it('normalizes seasonal and element wrappers to the same original month branch', () => {
    const registry = new NarrativeEvidenceRegistry(context)
    const month = registry.register({ source: 'natal', path: 'month.branch' })
    const element = registry.register({ source: 'natal', path: 'elements.month.branch' })
    const season = registry.register({ source: 'analysis', path: 'seasonal.season' })
    expect(element.derivedFrom).toEqual([month.id])
    expect(season.derivedFrom).toEqual([month.id])
    expect(registry.independentGroups([month.id, month.id, element.id, season.id])).toHaveLength(1)
  })

  it('tracks transitive aliases and retains luck periods', () => {
    const registry = new NarrativeEvidenceRegistry(context)
    const annual = registry.register({ source: 'annual', path: 'stemTenGod' })
    const flow = registry.register({ source: 'flow', path: 'annual.stemTenGod' })
    const facts = registry.register({ source: 'interpretationFacts', path: 'flow.annual.stemTenGod' })
    expect(flow.derivedFrom).toEqual([annual.id])
    expect(facts.derivedFrom).toEqual([flow.id])
    expect(registry.rootFactIds(facts.id)).toEqual(registry.rootFactIds(annual.id))
    expect(facts.period).toEqual({ startDateTime: context.luck.annual?.startDateTime, endDateTime: context.luck.annual?.endDateTime })
    expect(facts.scope).toBe('annual')
    expect(registry.independentGroups([annual.id, flow.id, facts.id])).toHaveLength(1)
  })

  it('counts disjoint observations separately but merges shared aggregate roots transitively', () => {
    const registry = new NarrativeEvidenceRegistry(context)
    const day = registry.register({ source: 'natal', path: 'day.stem' })
    const month = registry.register({ source: 'natal', path: 'month.branch' })
    const relation = registry.register({ source: 'analysis', path: 'seasonal.relation' })
    expect(registry.independentGroups([day.id, month.id])).toHaveLength(2)
    for (const ids of [[day.id, month.id, relation.id], [relation.id, month.id, day.id]]) {
      expect(registry.independentGroups(ids)).toHaveLength(1)
    }
    const strength = registry.register({ source: 'strength', path: 'confidence' })
    const counts = registry.register({ source: 'analysis', path: 'surfaceCounts.수' })
    expect(registry.independentGroups([strength.id, counts.id, relation.id])).toHaveLength(1)
  })

  it('rejects absent paths, missing observations and unknown lineage ids', () => {
    const registry = new NarrativeEvidenceRegistry(context)
    expect(() => registry.register({ source: 'natal', path: 'invented.trait' })).toThrow('Missing fact')
    expect(() => registry.register({ source: 'natal', path: '__proto__.anything' })).toThrow('Invalid fact path')
    expect(() => registry.rootFactIds('invented')).toThrow('Unknown evidence')
    const absent = new NarrativeEvidenceRegistry({ ...context, natal: { ...context.natal, hour: { stem: null, branch: null, korean: null } } })
    expect(() => absent.register({ source: 'natal', path: 'hour.stem' })).toThrow('Unavailable fact')
  })

  it('isolates evidence snapshots without mutating the calculated context', () => {
    const before = structuredClone(context)
    const registry = new NarrativeEvidenceRegistry(context)
    const counts = registry.register({ source: 'analysis', path: 'surfaceCounts' })
    expect(counts.value).toEqual(context.analysis.surfaceCounts)
    expect(counts.value).not.toBe(context.analysis.surfaceCounts)
    expect(Object.isFrozen(counts)).toBe(true)
    expect(Object.isFrozen(counts.value)).toBe(true)
    expect(context).toEqual(before)
  })
})
