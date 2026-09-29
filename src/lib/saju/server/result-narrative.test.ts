import { afterEach, describe, expect, it, vi } from 'vitest'
import * as calculator from '../calculator'
import * as analysis from '../analyzer/analysis-facts'
import * as strengthFacts from '../analyzer/strength-facts'
import * as strength from '../analyzer/strength'
import * as daewoon from '../analyzer/daewoon'
import * as interactions from '../analyzer/luck-interactions'
import * as flow from '../analyzer/luck-flow'
import * as keyPillars from '../analyzer/key-pillar-interactions'
import * as interpretation from '../analyzer/interpretation-facts'
import { buildNarrativePlan } from '../narrative/plan'
import { NarrativeEvidenceRegistry } from '../narrative/evidence'
import { buildResultNarrativeContext, buildResultReportFromContext } from './result-page'
import type { SajuInput } from '../types'

vi.mock('astro:env/server', () => ({}))
afterEach(() => vi.restoreAllMocks())

const input: SajuInput = { birthDate: '1991-01-02', birthTime: '13:04', gender: 'female', calendarType: 'solar', isLeapMonth: false }
const now = new Date('2026-09-13T00:00:00+09:00')

describe('shared report and narrative context', () => {
  it('retains every original result by reference and never reruns calculation for the report or plan', () => {
    const spies = {
      natal: vi.spyOn(calculator, 'calculateSaju'),
      annual: vi.spyOn(calculator, 'calculateAnnualLuck'),
      analysis: vi.spyOn(analysis, 'buildAnalysisFacts'),
      strengthFacts: vi.spyOn(strengthFacts, 'buildStrengthFacts'),
      strength: vi.spyOn(strength, 'assessStrength'),
      daewoonResult: vi.spyOn(daewoon, 'analyzeDaewoon'),
      interactions: vi.spyOn(interactions, 'analyzeLuckInteractions'),
      flow: vi.spyOn(flow, 'analyzeLuckFlow'),
      keyPillars: vi.spyOn(keyPillars, 'analyzeKeyPillarInteractions'),
      interpretationFacts: vi.spyOn(interpretation, 'buildInterpretationFacts'),
    }
    const context = buildResultNarrativeContext(input, now)
    for (const key of ['natal', 'analysis', 'strengthFacts', 'strength', 'daewoonResult', 'interactions', 'flow', 'keyPillars', 'interpretationFacts'] as const) {
      expect(context[key]).toBe(spies[key].mock.results[0].value)
    }
    expect(context.luck).toBe(context.interpretationFacts.luck)
    expect(context.luck.annual).toBe(spies.annual.mock.results[0].value)
    expect(context.daewoonResult.cycles).toContain(context.luck.daewoon)
    const before = structuredClone(context)
    const report = buildResultReportFromContext(context)
    const reportBefore = JSON.stringify(report)
    buildNarrativePlan(context)
    expect(JSON.stringify(buildResultReportFromContext(context))).toBe(reportBefore)
    for (const spy of Object.values(spies)) expect(spy).toHaveBeenCalledTimes(1)
    expect(context).toEqual(before)
    expect(Object.keys(report)).toEqual(['pillars', 'luck', 'daewoonNotice', 'report'])
    expect(JSON.stringify(report)).not.toMatch(/narrative-context|strengthFacts|analysis|hasBirthTime/)
  })

  it('keeps unknown birth-time daewoon unselected while allowing a named annual target', () => {
    for (const birthTime of ['13:04', null]) {
      const context = buildResultNarrativeContext({ ...input, birthTime }, now)
      const plan = buildNarrativePlan(context)
      expect(plan).toMatchObject({
        methodologyVersion: 'narrative-plan-v1', referenceDate: '2026-09-13', referenceYear: 2026, annualTargetYear: 2026,
      })
      expect(plan.current?.some((claim) => claim.phaseCode === 'annual_target_phase' && claim.annualTargetYear === 2026)).toBe(true)
      if (birthTime === null) {
        expect(plan.past).toBeUndefined()
        expect(plan.future).toBeUndefined()
        expect(plan.current?.every((claim) => claim.context.temporalRole === 'target')).toBe(true)
        expect(context.timing.daewoon).toBe('birth-time-missing')
        expect(context.luck.daewoon).toBeUndefined()
        expect(context.daewoonResult.cycles.every((cycle) => cycle.startDateTime === null && cycle.endDateTime === null)).toBe(true)
        expect(() => new NarrativeEvidenceRegistry(context).register({ source: 'daewoon', path: 'stem' })).toThrow()
      }
    }
  })

  it('distinguishes the reference civil year, selected 2026 year, and Lichun interval', () => {
    const nextYear = buildResultNarrativeContext(input, new Date('2026-12-31T15:01:00Z'))
    expect(nextYear).toMatchObject({ referenceDate: '2027-01-01', referenceYear: 2027, annualTargetYear: 2026,
      timing: { annualMatchesReferenceYear: false, annualContainsReferenceInstant: true } })
    const january = buildResultNarrativeContext(input, new Date('2026-01-01T00:00:00+09:00'))
    expect(january.timing).toMatchObject({ annualMatchesReferenceYear: true, annualContainsReferenceInstant: false })
    const later = buildResultNarrativeContext(input, new Date('2029-09-13T00:00:00+09:00'))
    expect(later).toMatchObject({ referenceYear: 2029, annualTargetYear: 2026,
      timing: { annualMatchesReferenceYear: false, annualContainsReferenceInstant: false } })
  })

  it('preserves missing-time versus unavailable timing and first-cycle boundaries', () => {
    const unavailable = buildResultNarrativeContext({ ...input, trueSolarTime: { longitude: 127 } }, now)
    expect(unavailable.hasBirthTime).toBe(true)
    expect(unavailable.timing.daewoon).toBe('unavailable')
    const beforeFirst = buildResultNarrativeContext(input, new Date('1991-01-03T00:00:00+09:00'))
    expect(beforeFirst.timing.daewoon).toBe('outside-cycles')
    expect(buildNarrativePlan(beforeFirst).current?.every((claim) => claim.context.temporalRole === 'target')).toBe(true)
  })
})
