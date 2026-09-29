import { describe, expect, it } from 'vitest'
import { allocateNarrativeClaims, SEMANTIC_GROUP } from './allocation'
import { assessNarrativeClaim } from './claims'
import { NarrativeEvidenceRegistry } from './evidence'
import { selectNarrativeSignals, type SelectedNarrativeSignal } from './selection'
import { buildNarrativeSignals } from './signals'
import { structuralContext } from './test-fixtures'
import type { NarrativeSignal } from './types'

function accepted(registry: NarrativeEvidenceRegistry, signal: NarrativeSignal): SelectedNarrativeSignal {
  const assessment = assessNarrativeClaim(registry, signal)
  if (assessment.status !== 'accepted') throw new Error(`Fixture signal excluded: ${signal.code}`)
  return { signal, claim: assessment.claim, independentGroups: assessment.independentGroups }
}

describe('deterministic Narrative claim allocation', () => {
  it('uses chapter evidence specificity before fixed field priority', () => {
    const registry = new NarrativeEvidenceRegistry(structuralContext(['병인', '정유', '갑자', null]))
    const signal = buildNarrativeSignals(registry).find((item) => item.code === 'expression_production_focus')
    expect(signal).toBeDefined()
    const item = accepted(registry, { ...signal!, targets: ['socialSelf', 'work'] })
    const allocated = allocateNarrativeClaims(registry, [item])
    expect(allocated.body.work?.[0]).toBe(item.claim)
    expect(allocated.body.socialSelf).toBeUndefined()
  })

  it('assigns relationship evidence to relationship while keeping a generic mode in work', () => {
    const registry = new NarrativeEvidenceRegistry(structuralContext(['병인', '정유', '갑자', '경오']))
    const signals = buildNarrativeSignals(registry)
    const selected = selectNarrativeSignals(registry, signals.map((signal) => signal.code === 'relationship_expression_adjustment'
      ? { ...signal, targets: ['relationship', 'work'] } : signal))
    const allocated = allocateNarrativeClaims(registry, selected)
    expect(allocated.body.relationship?.map((claim) => claim.code)).toContain('relationship_expression_adjustment')
    expect(allocated.body.work?.map((claim) => claim.code)).toContain('expression_production_focus')
    expect(allocated.body.work?.map((claim) => claim.code)).not.toContain('relationship_expression_adjustment')
  })

  it('assigns repeated relations to recurringPattern before another eligible chapter', () => {
    const registry = new NarrativeEvidenceRegistry(structuralContext(['병자', '병오', '갑인', '병신']))
    const signals = buildNarrativeSignals(registry)
    const selected = selectNarrativeSignals(registry, signals.map((signal) => signal.code === 'recurring_coordination_tension'
      ? { ...signal, targets: ['work', 'recurringPattern'] } : signal))
    const allocated = allocateNarrativeClaims(registry, selected)
    expect(allocated.body.recurringPattern?.[0]?.code).toBe('recurring_coordination_tension')
    expect(allocated.body.work?.map((claim) => claim.code) ?? []).not.toContain('recurring_coordination_tension')
  })

  it('deduplicates shared semantic lineage across codes and keeps evidence/confidence unchanged', () => {
    const registry = new NarrativeEvidenceRegistry(structuralContext(['병인', '병진', '갑오', '병신']))
    const signals = buildNarrativeSignals(registry).filter((signal) => signal.meaningKey === 'working-mode:output')
    expect(signals).toHaveLength(2)
    const selected = signals.map((signal) => accepted(registry, signal))
    const before = structuredClone(selected)
    const allocated = allocateNarrativeClaims(registry, selected)
    expect(allocated.body.socialSelf?.[0]).toBe(selected.find((item) => item.signal.code === 'visible_expression_pattern')?.claim)
    expect(allocated.body.work).toBeUndefined()
    expect(allocated.body.hiddenStrength).toBeUndefined()
    expect(allocated.hook).toHaveLength(1)
    expect(allocated.hookPreviews).toEqual([{ claimCode: 'visible_expression_pattern',
      semanticGroup: 'expression_production', owner: 'socialSelf' }])
    expect(selected).toEqual(before)
    expect(allocateNarrativeClaims(registry, [...selected].reverse())).toEqual(allocated)
  })

  it('lets work own a repeated positive claim and leaves hiddenStrength empty unless independently available', () => {
    const registry = new NarrativeEvidenceRegistry(structuralContext(['병인', '병진', '갑오', '병신']))
    const signal = buildNarrativeSignals(registry).find((item) => item.code === 'visible_expression_pattern')
    expect(signal).toBeDefined()
    const item = accepted(registry, { ...signal!, targets: ['work', 'hiddenStrength'] })
    const allocated = allocateNarrativeClaims(registry, [item])
    expect(allocated.body.work?.[0]).toBe(item.claim)
    expect(allocated.body.hiddenStrength).toBeUndefined()
    expect(allocated.hook[0]).toBe(item.claim)
    expect(allocated.hookPreviews[0]?.owner).toBe('work')
    const hiddenOnly = accepted(registry, { ...signal!, targets: ['hiddenStrength'] })
    expect(allocateNarrativeClaims(registry, [hiddenOnly]).body.hiddenStrength?.[0]).toBe(hiddenOnly.claim)
  })

  it('keeps empty fields empty and maps every current code to a semantic group', () => {
    const registry = new NarrativeEvidenceRegistry(structuralContext(['경오', '무인', '갑자', null]))
    expect(allocateNarrativeClaims(registry, [])).toEqual({ body: {}, hook: [], hookPreviews: [] })
    expect(SEMANTIC_GROUP.visible_expression_pattern).toBe(SEMANTIC_GROUP.expression_production_focus)
    expect(SEMANTIC_GROUP.visible_responsibility_pattern).toBe(SEMANTIC_GROUP.responsibility_structure_focus)
  })
})
