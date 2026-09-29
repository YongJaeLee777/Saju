import { describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import { NarrativeEvidenceRegistry } from './evidence'
import { assessNarrativeClaim } from './claims'
import { buildNarrativePlan } from './plan'
import type { SajuInput, TenGod } from '../types'

vi.mock('astro:env/server', () => ({}))
const input: SajuInput = { birthDate: '1991-01-02', birthTime: '13:04', gender: 'female',
  calendarType: 'solar', isLeapMonth: false }
const reference = new Date('2026-09-13T00:00:00+09:00')
const all = (plan: ReturnType<typeof buildNarrativePlan>) =>
  [...(plan.past ?? []), ...(plan.current ?? []), ...(plan.future ?? [])]
const groupsByTenGod: Record<TenGod, string> = { 비견: 'peers', 겁재: 'peers', 편인: 'resource', 정인: 'resource',
  식신: 'output', 상관: 'output', 편재: 'wealth', 정재: 'wealth', 편관: 'officer', 정관: 'officer' }

describe('structured temporal Narrative v1', () => {
  it('selects adjacent calculated cycles and preserves exclusive end boundaries', () => {
    const before = buildResultNarrativeContext(input, new Date('2029-08-06T17:03:59+09:00'))
    const at = buildResultNarrativeContext(input, new Date('2029-08-06T17:04:00+09:00'))
    const beforeIndex = before.daewoonResult.cycles.indexOf(before.luck.daewoon!)
    const atIndex = at.daewoonResult.cycles.indexOf(at.luck.daewoon!)
    expect(atIndex).toBe(beforeIndex + 1)
    for (const context of [before, at]) {
      const plan = buildNarrativePlan(context)
      const selected = context.luck.daewoon!
      const selectedIndex = context.daewoonResult.cycles.indexOf(selected)
      for (const claim of plan.past ?? []) {
        expect(claim.period).toMatchObject({ startDateTime: context.daewoonResult.cycles[selectedIndex - 1].startDateTime,
          endDateTime: selected.startDateTime })
      }
      for (const claim of plan.future ?? []) {
        expect(claim.period).toMatchObject({ startDateTime: selected.endDateTime,
          endDateTime: context.daewoonResult.cycles[selectedIndex + 1].endDateTime })
      }
      expect(plan.current?.filter((claim) => claim.phaseCode === 'daewoon_phase')
        .every((claim) => claim.period.startDateTime === selected.startDateTime)).toBe(true)
    }
  })

  it('separates the 2026 target from the civil reference year and never selects unknown-time daewoon', () => {
    for (const instant of [new Date('2026-09-13T00:00:00+09:00'), new Date('2027-01-01T00:01:00+09:00'),
      new Date('2029-09-13T00:00:00+09:00')]) {
      const context = buildResultNarrativeContext({ ...input, birthTime: null }, instant)
      const plan = buildNarrativePlan(context)
      expect(plan.past).toBeUndefined()
      expect(plan.future).toBeUndefined()
      expect(plan.current?.every((claim) => claim.phaseCode === 'annual_target_phase'
        && claim.context.temporalRole === 'target' && claim.annualTargetYear === 2026)).toBe(true)
      expect(plan.referenceYear).toBe(context.referenceYear)
      expect(plan.annualTargetYear).toBe(2026)
    }
  })

  it('uses observed changes only and keeps all selected evidence resolvable', () => {
    const context = buildResultNarrativeContext(input, reference)
    const report = buildResultReportFromContext(context)
    const plan = buildNarrativePlan(context)
    expect(buildNarrativePlan(context)).toEqual(plan)
    expect(buildResultReportFromContext(context)).toEqual(report)
    const evidence = new Map(plan.evidence?.map((fact) => [fact.id, fact]))
    const registry = new NarrativeEvidenceRegistry(context)
    const selectedIndex = context.daewoonResult.cycles.indexOf(context.luck.daewoon!)
    for (const claim of all(plan)) {
      expect(['strong', 'medium']).toContain(claim.confidence)
      expect(claim.evidence.length).toBeGreaterThan(0)
      expect(claim.context.period).toEqual(claim.period)
      for (const use of claim.evidence) expect(evidence.has(use.factId)).toBe(true)
      const groups = registry.independentGroups(claim.evidence.filter((use) => use.role !== 'context')
        .map((use) => registry.register({ source: evidence.get(use.factId)!.source,
          path: evidence.get(use.factId)!.path }).id)).length
      if (claim.confidence === 'strong') expect(groups).toBeGreaterThanOrEqual(2)
      if (claim.changeDirection) {
        const target = claim.context.temporalRole === 'past' ? context.daewoonResult.cycles[selectedIndex - 1]
          : context.daewoonResult.cycles[selectedIndex + 1]
        const comparison = context.daewoonResult.cycles[selectedIndex]
        const groups = (cycle: typeof target) => [groupsByTenGod[cycle.stemTenGod], groupsByTenGod[cycle.branchTenGod]]
        const theme = claim.changeTheme!
        if (claim.changeDirection === 'introduced') {
          expect(groups(target)).toContain(theme)
          expect(groups(comparison)).not.toContain(theme)
          expect(claim.activatedThemes).toContain(theme)
        } else {
          expect(groups(target)).not.toContain(theme)
          expect(groups(comparison)).toContain(theme)
          expect(claim.activatedThemes).not.toContain(theme)
        }
        expect(claim.context.comparisonPeriod).toBeDefined()
      } else expect(claim.context.comparisonPeriod).toBeUndefined()
    }
    expect(JSON.stringify(all(plan))).not.toMatch(/결혼|이직|돈을 번다|eventPrediction|predictedEvent/)
  })

  it('does not promote duplicate lineage to Strong', () => {
    const context = buildResultNarrativeContext(input, reference)
    const registry = new NarrativeEvidenceRegistry(context)
    const fact = registry.register({ source: 'annual', path: 'stem' })
    const period = { startDateTime: context.luck.annual!.startDateTime, endDateTime: context.luck.annual!.endDateTime }
    const use = { factId: fact.id, direction: 'supports' as const, weight: 'strong' as const, ruleId: 'test' }
    const assessment = assessNarrativeClaim(registry, { code: 'duplicate', positiveSide: 'structural_option',
      evidence: [use, use], context: { scope: 'annual', period, temporalRole: 'target' } })
    expect(assessment).toMatchObject({ status: 'accepted', independentGroups: 1, claim: { confidence: 'medium' } })
  })
})
