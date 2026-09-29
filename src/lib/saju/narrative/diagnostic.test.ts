import { describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import type { SajuInput } from '../types'
import { NarrativeEvidenceRegistry } from './evidence'
import { buildNarrativePlan } from './plan'
import { NARRATIVE_DIAGNOSTIC_DATE, NARRATIVE_DIAGNOSTIC_INPUTS } from './diagnostic-inputs'
import type { NarrativeClaim, NarrativePlan } from './types'

vi.mock('astro:env/server', () => ({}))

const now = NARRATIVE_DIAGNOSTIC_DATE
const samples = NARRATIVE_DIAGNOSTIC_INPUTS
const fields = ['primaryTension', 'hook', 'socialSelf', 'privateSelf', 'relationship', 'work',
  'hiddenStrength', 'recurringPattern'] as const

function selectedClaims(plan: NarrativePlan): NarrativeClaim[] {
  return fields.flatMap((field) => asClaims(plan[field]))
}

function asClaims(value: NarrativeClaim | readonly NarrativeClaim[] | undefined): readonly NarrativeClaim[] {
  return value ? 'code' in value ? [value] : value : []
}

describe('Narrative SIGNAL v1 real-chart diagnostic', () => {
  it('keeps five distinct calculated charts auditable and selection conservative', () => {
    const reviews: string[] = []
    const combinations: string[] = []
    const motifModes: string[] = []

    for (const sample of samples) {
      const input: SajuInput = { ...sample, calendarType: 'solar', isLeapMonth: false }
      const context = buildResultNarrativeContext(input, now)
      const reportBefore = buildResultReportFromContext(context)
      const plan = buildNarrativePlan(context)
      expect(plan.coreMetaphor).toBeDefined()
      motifModes.push(plan.coreMetaphor!.mode)
      expect(plan.allocationMethodologyVersion).toBe('narrative-allocation-v1')
      const registry = new NarrativeEvidenceRegistry(context)
      const facts = new Map((plan.evidence ?? []).map((fact) => [fact.id, fact]))
      for (const fact of plan.evidence ?? []) expect(registry.register({ source: fact.source, path: fact.path }).id).toBe(fact.id)

      expect(buildNarrativePlan(context)).toEqual(plan)
      expect(buildResultReportFromContext(context)).toEqual(reportBefore)
      expect(plan.hook?.length ?? 0).toBeLessThanOrEqual(3)
      expect(new Set(plan.hook?.map((claim) => claim.code)).size).toBe(plan.hook?.length ?? 0)
      const hookGroups = plan.hook?.flatMap((claim) => claim.attributes?.groups ?? []) ?? []
      expect(new Set(hookGroups).size).toBe(hookGroups.length)
      const owned = fields.filter((field) => field !== 'hook').flatMap((field) => asClaims(plan[field]))
      expect(new Set(owned.map((claim) => claim.code)).size).toBe(owned.length)
      expect(plan.hookPreviews?.length ?? 0).toBe(plan.hook?.length ?? 0)
      plan.hookPreviews?.forEach((preview, index) => {
        expect(preview.claimCode).toBe(plan.hook?.[index]?.code)
        if (preview.owner) expect(asClaims(plan[preview.owner]).some((claim) => claim.code === preview.claimCode)).toBe(true)
      })
      for (const claim of selectedClaims(plan)) {
        expect(claim.evidence.length).toBeGreaterThan(0)
        expect(['strong', 'medium']).toContain(claim.confidence)
      }
      if (plan.coreMetaphor) {
        expect(plan.coreMetaphor.evidence.length).toBeGreaterThan(0)
        expect(plan.coreMetaphor.closingMotif.referenceCode).toBe(plan.coreMetaphor.code)
        const support = plan.coreMetaphor.evidence.filter((use) => use.role !== 'context')
        const groups = registry.independentGroups(support.map((use) => use.factId)).length
        if (plan.coreMetaphor.mode === 'base') {
          expect(support).toHaveLength(0)
          expect(plan.coreMetaphor.confidence).toBeUndefined()
          expect(plan.coreMetaphor.positiveMeaning).toBeUndefined()
          expect(plan.coreMetaphor.shadowMeaning).toBeUndefined()
        } else if (plan.coreMetaphor.confidence === 'strong') expect(groups).toBeGreaterThanOrEqual(2)
      }
      combinations.push(JSON.stringify(fields.map((field) => asClaims(plan[field]).map((claim) => claim.code))))

      const format = (claim: NarrativeClaim) => {
        const support = claim.evidence.filter((use) => use.role !== 'context' && use.direction === 'supports')
        expect(support.length).toBeGreaterThan(0)
        const groups = registry.independentGroups(support.map((use) => use.factId)).length
        if (claim.confidence === 'strong') expect(groups).toBeGreaterThanOrEqual(2)
        const paths = [...new Set(claim.evidence.filter((use) => use.role !== 'context').map((use) => {
          const fact = facts.get(use.factId)
          expect(fact).toBeDefined()
          return `${fact!.source}:${fact!.path}`
        }))].sort()
        const contextCount = claim.evidence.filter((use) => use.role === 'context').length
        return `${claim.code} [${claim.confidence}, groups=${groups}] ${paths.join(', ')}${contextCount ? ` (+${contextCount} context)` : ''}`
      }
      reviews.push(`\n${sample.birthDate} ${sample.birthTime}`)
      reviews.push(`  coreMetaphor: ${plan.coreMetaphor?.mode}:${plan.coreMetaphor?.code}${plan.coreMetaphor?.mode === 'contextual'
        ? ` [${plan.coreMetaphor.confidence}]` : ''}`)
      for (const field of fields) {
        const claims = asClaims(plan[field])
        reviews.push(`  ${field}: ${claims.length ? claims.map(format).join(' | ') : '(empty)'}`)
        if (field === 'hook') reviews.push(`  hookPreviews: ${plan.hookPreviews?.map((preview) => `${preview.claimCode}->${preview.owner ?? 'unowned'}`).join(', ') ?? '(empty)'}`)
      }
      for (const field of ['past', 'current', 'future'] as const) {
        reviews.push(`  ${field}: ${plan[field]?.map((claim) =>
          `${claim.code} [${claim.confidence}] ${claim.period.startDateTime}..${claim.period.endDateTime}`).join(' | ') ?? '(empty)'}`)
      }
    }

    expect(new Set(combinations).size).toBe(samples.length)
    expect(motifModes.filter((mode) => mode === 'base')).toHaveLength(3)
    expect(motifModes.filter((mode) => mode === 'contextual')).toHaveLength(2)
    expect(reviews.join('\n')).toMatchSnapshot()
  })
})
