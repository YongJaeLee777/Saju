import { describe, expect, it } from 'vitest'
import { NarrativeEvidenceRegistry } from './evidence'
import { buildNarrativeSignals } from './signals'
import { selectNarrativeSignals } from './selection'
import { assessNarrativeClaim } from './claims'
import { structuralContext } from './test-fixtures'
import type { NarrativeSignal } from './types'

function fixture() {
  const registry = new NarrativeEvidenceRegistry(structuralContext(['병인', '병진', '갑오', '병신']))
  const signals = buildNarrativeSignals(registry).filter((signal) => signal.meaningKey === 'working-mode:output')
  return { registry, signals }
}

describe('deterministic Narrative selection', () => {
  it('deduplicates the same meaning across codes and picks the more specific independent pattern', () => {
    const { registry, signals } = fixture()
    expect(signals).toHaveLength(2)
    const first = selectNarrativeSignals(registry, [...signals, ...signals])
    expect(first).toHaveLength(1)
    expect(first[0].claim.code).toBe('visible_expression_pattern')
    expect(selectNarrativeSignals(registry, [...signals].reverse())).toEqual(first)
  })

  it('excludes both applicable opposing claims instead of resolving conflict by ranking', () => {
    const { registry, signals } = fixture()
    const first: NarrativeSignal = { ...signals[0], meaningKey: 'opposition:a', exclusive: { axis: 'test-mode', value: 'a' } }
    const second: NarrativeSignal = { ...signals[1], meaningKey: 'opposition:b', exclusive: { axis: 'test-mode', value: 'b' } }
    expect(selectNarrativeSignals(registry, [first, second])).toEqual([])
    expect(selectNarrativeSignals(registry, [second, first])).toEqual([])
  })

  it('retains only a condition that actually matches an existing fact', () => {
    const { registry, signals } = fixture()
    const fact = registry.register({ source: 'natal', path: 'day.stem' })
    const first: NarrativeSignal = { ...signals[0], meaningKey: 'conditional:a', exclusive: { axis: 'test-mode', value: 'a' },
      condition: { code: 'recorded-day', factId: fact.id, equals: '갑' } }
    const second: NarrativeSignal = { ...signals[1], meaningKey: 'conditional:b', exclusive: { axis: 'test-mode', value: 'b' },
      condition: { code: 'recorded-day', factId: fact.id, equals: '을' } }
    expect(selectNarrativeSignals(registry, [first, second]).map((item) => item.signal.meaningKey)).toEqual(['conditional:a'])
  })

  it('excludes Weak or opposing evidence even if a signal has high specificity', () => {
    const registry = new NarrativeEvidenceRegistry(structuralContext(['병인', '정유', '갑자', '임신']))
    const signal = buildNarrativeSignals(registry).find((item) => item.code === 'expression_production_focus')!
    const weak: NarrativeSignal = { ...signal, specificity: 100, evidence: signal.evidence.map((item) => ({ ...item, weight: 'weak' })) }
    expect(selectNarrativeSignals(registry, [weak])).toEqual([])
    const conflict: NarrativeSignal = { ...signal, evidence: signal.evidence.map((item, index) => ({ ...item,
      direction: index === 0 ? 'opposes' : item.direction })) }
    expect(selectNarrativeSignals(registry, [conflict])).toEqual([])
  })

  it('context aggregates remain traceable without increasing confidence or hiding contradictions', () => {
    const { registry, signals } = fixture()
    const day = registry.register({ source: 'natal', path: 'day.stem' })
    const month = registry.register({ source: 'natal', path: 'month.branch' })
    const candidate: NarrativeSignal = { ...signals[0], condition: undefined, evidence: [
      { factId: day.id, direction: 'supports', weight: 'strong', ruleId: 'test' },
      { factId: month.id, direction: 'supports', weight: 'strong', ruleId: 'test', role: 'context' },
    ] }
    expect(assessNarrativeClaim(registry, candidate)).toMatchObject({ status: 'accepted', independentGroups: 1, claim: { confidence: 'medium' } })
    expect(assessNarrativeClaim(registry, { ...candidate, evidence: candidate.evidence.map((item) => ({ ...item, role: 'context' })) }))
      .toEqual({ status: 'excluded', reason: 'weak' })
    expect(assessNarrativeClaim(registry, { ...candidate, evidence: [candidate.evidence[0], { ...candidate.evidence[1], direction: 'opposes' }] }))
      .toEqual({ status: 'excluded', reason: 'conflict' })
  })
})
