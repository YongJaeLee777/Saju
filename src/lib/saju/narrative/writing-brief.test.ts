import { describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import type { SajuInput } from '../types'
import { buildNarrativePlan } from './plan'
import type { NarrativeClaim, NarrativePlan } from './types'
import { buildChapterWritingBriefs } from './writing-brief'
import type { WritingPlanField } from './writing-brief'

vi.mock('astro:env/server', () => ({}))
const now = new Date('2026-09-13T00:00:00+09:00')
const samples = [
  { birthDate: '1988-09-13', birthTime: '13:04', gender: 'female' },
  { birthDate: '1973-01-24', birthTime: '13:04', gender: 'female' },
  { birthDate: '1992-02-13', birthTime: '21:30', gender: 'male' },
  { birthDate: '1973-11-13', birthTime: '13:04', gender: 'female' },
  { birthDate: '1984-01-24', birthTime: '13:04', gender: 'female' },
] as const
const input = (sample: typeof samples[number]): SajuInput => ({ ...sample, calendarType: 'solar', isLeapMonth: false })

function planClaim(plan: NarrativePlan, field: WritingPlanField, code: string): NarrativeClaim | undefined {
  const value = plan[field]
  if (!value || typeof value !== 'object') return undefined
  return ('code' in value ? [value] : Array.isArray(value) ? value : [])
    .find((item): item is NarrativeClaim => typeof item === 'object' && item !== null
      && 'code' in item && item.code === code)
}

describe('WritingBrief v1 projection', () => {
  it('uses only selected claims, motif, and direct evidence from the unchanged Plan', () => {
    for (const sample of samples) {
      const context = buildResultNarrativeContext(input(sample), now)
      const report = buildResultReportFromContext(context)
      const plan = buildNarrativePlan(context)
      const before = structuredClone(plan)
      const briefs = buildChapterWritingBriefs(plan)
      expect(buildChapterWritingBriefs(plan)).toEqual(briefs)
      expect(plan).toEqual(before)
      expect(buildResultReportFromContext(context)).toEqual(report)
      const facts = new Map(plan.evidence?.map((fact) => [fact.id, fact]))
      expect(new Set(briefs.map((brief) => brief.chapter)).size).toBe(briefs.length)
      expect(briefs.map((brief) => brief.chapter)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
      const useKeys = briefs.flatMap((brief) => brief.sourceUses.map((use) => `${use.code}:${use.angle}`))
      expect(new Set(useKeys).size).toBe(useKeys.length)
      const usesByCode = new Map<string, Set<string>>()
      for (const brief of briefs) for (const use of brief.sourceUses) {
        const angles = usesByCode.get(use.code) ?? new Set<string>()
        expect(angles.has(use.angle)).toBe(false)
        angles.add(use.angle)
        usesByCode.set(use.code, angles)
      }
      expect([...usesByCode.values()].some((angles) => angles.size > 1)).toBe(true)
      if (plan.coreMetaphor.mode === 'contextual') {
        expect(briefs.find((brief) => brief.role === 'coreIdentity')?.allowedPoints.some((point) =>
          point.source.kind === 'contextual-motif' && point.code === plan.coreMetaphor.positiveMeaning)).toBe(true)
      }
      for (const brief of briefs) {
        expect(brief.sourceUses.map((use) => use.code)).toEqual(brief.sourceClaimRefs.map((ref) => ref.code))
        expect(brief.primarySourceRefs.every((ref) => brief.sourceClaimRefs.some((item) => item.code === ref.code))).toBe(true)
        expect(brief.secondarySourceRefs.every((ref) => brief.sourceClaimRefs.some((item) => item.code === ref.code))).toBe(true)
        if (brief.coverageMode === 'neutral_bridge') {
          expect(brief.primarySourceRefs).toEqual([])
          expect(brief.secondarySourceRefs).toEqual([])
          expect(brief.confidence).toBeUndefined()
          expect(brief.bridgeSourceRefs.length).toBeLessThanOrEqual(1)
          expect(brief.sourceClaimRefs.map((ref) => ref.code)).toEqual(brief.bridgeSourceRefs.map((ref) => ref.code))
          expect(brief.sourceUses.every((use) => use.ownership === 'bridge')).toBe(true)
          if (brief.chapter === 8) expect(brief.allowedPoints).toEqual([])
          if (brief.chapter === 3 || brief.chapter === 5) expect(brief.shadowPoints).toEqual([])
        }
        if (brief.chapter === 4 && !plan.privateSelf) {
          expect(brief.primarySourceRefs).toEqual([])
          expect(brief.sourceUses.every((use) => use.angle === 'choice_lens')).toBe(true)
        }
        if (brief.chapter === 5 && !plan.relationship) {
          expect(brief.primarySourceRefs).toEqual([])
          expect(brief.sourceUses.every((use) => use.angle === 'relationship_lens'
            || use.angle === 'relationship_context_bridge')).toBe(true)
        }
        for (const ref of brief.sourceClaimRefs) {
          const claim = planClaim(plan, ref.planField, ref.code)
          expect(claim).toBeDefined()
          expect(ref.confidence).toBe(claim?.confidence)
        }
        for (const point of [...brief.allowedPoints, ...brief.shadowPoints]) {
          const source = point.source
          if (source.kind === 'claim') {
            const ref = brief.sourceClaimRefs.find((item) => item.code === source.claimCode)!
            const claim = planClaim(plan, ref.planField, ref.code)!
            expect(claim[source.field]).toBe(point.code)
          } else {
            expect(plan.coreMetaphor.mode).toBe('contextual')
            expect(plan.coreMetaphor.code).toBe(source.motifCode)
            expect(plan.coreMetaphor[source.field]).toBe(point.code)
          }
        }
        for (const item of brief.evidenceSummary) {
          expect(facts.has(item.factId)).toBe(true)
          expect(item).not.toHaveProperty('value')
          expect(item.observedValue === undefined || ['string', 'number', 'boolean'].includes(typeof item.observedValue)).toBe(true)
        }
        expect(brief.suggestedSceneDomains.every((item) =>
          brief.sourceClaimRefs.some((ref) => ref.code === item.claimCode))).toBe(true)
        if (brief.sourceClaimRefs.some((ref) => ref.planField === 'relationship')) {
          expect(brief.forbiddenInferences).toContain('spouse_trait_assertion')
        }
        expect(JSON.stringify(brief)).not.toMatch(/실제로|결혼한다|이직한다|돈을 번다|sceneText|promptText/)
      }
    }
  })

  it('makes chapter 7 from previously validated positive sides without hiddenStrength', () => {
    const plan = buildNarrativePlan(buildResultNarrativeContext(input(samples[0]), now))
    expect(plan.hiddenStrength).toBeUndefined()
    const briefs = buildChapterWritingBriefs(plan)
    const strength = briefs.find((brief) => brief.role === 'strengthInUse')!
    expect(strength).toBeDefined()
    expect(strength.sourceClaimRefs.length).toBeGreaterThan(0)
    expect(strength.sourceClaimRefs.every((ref) => ref.planField !== 'hiddenStrength'
      && briefs.some((brief) => brief.chapter > 1 && brief.chapter < 7
        && brief.sourceClaimRefs.some((earlier) => earlier.code === ref.code)))).toBe(true)
    expect(strength.allowedPoints.every((point) => point.source.kind === 'claim'
      && point.source.field === 'positiveSide')).toBe(true)
  })

  it('keeps base motif as framing, and closing references only earlier chapter sources', () => {
    const plan = buildNarrativePlan(buildResultNarrativeContext(input(samples[3]), now))
    expect(plan.coreMetaphor.mode).toBe('base')
    const briefs = buildChapterWritingBriefs(plan)
    const identity = briefs.find((brief) => brief.role === 'coreIdentity')!
    expect(identity.motifRef?.mode).toBe('base')
    expect(identity.allowedPoints.every((point) => point.source.kind === 'claim')).toBe(true)
    const closing = briefs.find((brief) => brief.role === 'closing')!
    expect(closing).toBeDefined()
    expect(closing.sourceClaimRefs.every((ref) => briefs.some((brief) => brief.chapter < 12
      && brief.sourceClaimRefs.some((earlier) => earlier.code === ref.code)))).toBe(true)
    expect(closing.motifRef?.code).toBe(identity.motifRef?.code)
    expect(closing.allowedPoints.every((point) => point.source.kind === 'claim')).toBe(true)
  })

  it('uses only verified bridge references for fixture 1 without promoting a missing chapter claim', () => {
    const plan = buildNarrativePlan(buildResultNarrativeContext(input(samples[0]), now))
    const briefs = buildChapterWritingBriefs(plan)
    const expected = new Map([[3, ['preparation_analysis_focus', 'social_context_bridge']],
      [5, ['surface_support_contrast', 'relationship_context_bridge']],
      [8, ['preparation_analysis_focus', 'pattern_caution_bridge']]])
    for (const [chapter, [code, angle]] of expected) {
      const brief = briefs[chapter - 1]
      expect(brief.coverageMode).toBe('neutral_bridge')
      expect(brief.bridgeSourceRefs.map((ref) => ref.code)).toEqual([code])
      expect(brief.sourceUses).toEqual([{ code, angle, ownership: 'bridge' }])
      expect(brief.primarySourceRefs).toEqual([])
      expect(brief.secondarySourceRefs).toEqual([])
      expect(brief.confidence).toBeUndefined()
      expect(brief.allowedPoints.every((point) => point.source.kind === 'claim'
        && point.source.field === 'positiveSide')).toBe(true)
      expect(brief.shadowPoints.every((point) => point.source.kind === 'claim'
        && point.source.field === 'shadowSide')).toBe(true)
    }
    expect(plan.socialSelf).toBeUndefined()
    expect(plan.relationship).toBeUndefined()
    expect(plan.recurringPattern).toBeUndefined()
  })

  it('carries temporal periods and the explicit 2026 target across a 2027 reference date', () => {
    const context = buildResultNarrativeContext(input(samples[2]), new Date('2027-01-01T00:01:00+09:00'))
    const briefs = buildChapterWritingBriefs(buildNarrativePlan(context))
    expect(briefs.find((brief) => brief.role === 'past')?.forbiddenInferences).toContain('actual_past_event')
    expect(briefs.find((brief) => brief.role === 'future')?.forbiddenInferences).toContain('job_change_prediction')
    const current = briefs.find((brief) => brief.role === 'current')!
    expect(current.temporalScope).toMatchObject({ referenceYear: 2027, annualTargetYear: 2026 })
    expect(current.temporalScope?.claims.some((claim) => claim.temporalRole === 'target'
      && claim.annualTargetYear === 2026 && claim.scope === 'annual')).toBe(true)
    expect(current.forbiddenInferences).toContain('relative_year_without_target_check')
  })

  it('covers sparse plans with neutral bridges without creating a strength or closing claim', () => {
    const original = buildNarrativePlan(buildResultNarrativeContext(input(samples[3]), now))
    const sparse: NarrativePlan = { methodologyVersion: original.methodologyVersion,
      referenceDate: original.referenceDate, referenceYear: original.referenceYear,
      annualTargetYear: original.annualTargetYear, coreMetaphor: original.coreMetaphor, evidence: original.evidence }
    const briefs = buildChapterWritingBriefs(sparse)
    expect(briefs.map((brief) => brief.chapter)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(briefs[1].coreMessage.kind).toBe('motif_framing')
    expect(briefs[1].coverageMode).toBe('neutral_bridge')
    expect(briefs[1].allowedPoints).toEqual([])
    expect(briefs.filter((brief) => brief.coverageMode === 'neutral_bridge').every((brief) =>
      brief.bridgeSourceRefs.length === 0 && brief.allowedPoints.length === 0)).toBe(true)
    expect(briefs[6].sourceClaimRefs).toEqual([])
    expect(briefs[11].sourceClaimRefs).toEqual([])
  })

  it('snapshots 12-chapter coverage and source angles for five real fixtures', () => {
    const reviews = samples.map((sample) => ({
      input: `${sample.birthDate} ${sample.birthTime}`,
      chapters: buildChapterWritingBriefs(buildNarrativePlan(buildResultNarrativeContext(input(sample), now)))
        .map((brief) => ({ chapter: brief.chapter, role: brief.role,
          coverageMode: brief.coverageMode,
          confidence: brief.confidence ?? null,
          primary: brief.primarySourceRefs.map((ref) => ref.code),
          secondary: brief.secondarySourceRefs.map((ref) => ref.code),
          bridge: brief.bridgeSourceRefs.map((ref) => ref.code),
          narrativeAngle: brief.sourceUses.map((use) => `${use.code}:${use.angle}`) })),
    }))
    for (const review of reviews) expect(review.chapters).toHaveLength(12)
    expect(reviews).toMatchSnapshot()
  })
})
