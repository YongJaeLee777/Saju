import { describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import { buildCopySemantics, COPY_SEMANTICS_POLICIES } from './copy-semantics'
import { NARRATIVE_DIAGNOSTIC_DATE, NARRATIVE_DIAGNOSTIC_INPUTS } from './diagnostic-inputs'
import { describeHeadlineMeaning } from './deterministic-writer'
import { buildHeadlineBriefs } from './headline-brief'
import { buildLockedPreview } from './locked-preview'
import { buildNarrativePlan } from './plan'
import { buildChapterWritingBriefs } from './writing-brief'

vi.mock('astro:env/server', () => ({}))

function fixture(index = 0) {
  const context = buildResultNarrativeContext({ ...NARRATIVE_DIAGNOSTIC_INPUTS[index],
    calendarType: 'solar', isLeapMonth: false }, NARRATIVE_DIAGNOSTIC_DATE)
  const plan = buildNarrativePlan(context)
  const briefs = buildChapterWritingBriefs(plan)
  const fallback = buildLockedPreview(briefs)
  return { context, plan, briefs, fallback }
}

describe('CopySemantics v1', () => {
  it('traces every framing to existing allowed claim points without changing Plan, confidence, allocation or report', () => {
    for (let index = 0; index < 5; index++) {
      const { context, plan, briefs, fallback } = fixture(index)
      const before = { plan: structuredClone(plan), briefs: structuredClone(briefs),
        report: buildResultReportFromContext(context), fallback: structuredClone(fallback) }
      const headlines = buildHeadlineBriefs(briefs, fallback, plan)
      for (const brief of briefs.filter((item) => item.coverageMode !== 'neutral_bridge')) for (const source of brief.sourceClaimRefs) {
        const copy = buildCopySemantics(brief, source)
        expect(copy, source.code).toBeDefined()
        if (!copy) continue
        expect(copy.source).toEqual(source)
        expect(copy.sourcePointCodes.every((code) => [...brief.allowedPoints, ...brief.shadowPoints]
          .some((point) => point.code === code && point.source.kind === 'claim'
            && point.source.claimCode === source.code))).toBe(true)
        expect(copy).not.toHaveProperty('evidence')
        expect(copy).not.toHaveProperty('thesis')
        expect(buildCopySemantics(brief, source)).toEqual(copy)
      }
      expect(headlines.filter((brief) => !brief.personalizationAllowed).every((brief) =>
        !brief.allowedMeanings.length && !brief.sourceRefs.length && brief.copyIntent === 'exploratory_question')).toBe(true)
      expect(JSON.stringify(headlines)).not.toMatch(/준비와 분석|책임과 구조|자원 선택과 현실화|표현과 생산/)
      for (const brief of briefs) {
        for (const source of brief.sourceClaimRefs) expect(JSON.stringify(headlines)).not.toContain(source.code)
        const headline = headlines.find((item) => item.chapter === brief.chapter)!
        for (const meaning of headline.allowedMeanings) {
          const sourceIndex = Number(meaning.sourceRef.split('_')[1]) - 1
          const copy = buildCopySemantics(brief, brief.sourceClaimRefs[sourceIndex])!
          expect(meaning.positive).toEqual(copy.positiveFramings)
          expect(meaning.behavioralFramings).toEqual(copy.behavioralFramings)
          expect(meaning.shadow).toEqual(copy.shadowFramings)
        }
      }
      expect(JSON.stringify(headlines).length).toBeLessThan(23980)
      expect(buildHeadlineBriefs(briefs, fallback, plan)).toEqual(headlines)
      expect(plan).toEqual(before.plan)
      expect(briefs).toEqual(before.briefs)
      expect(buildResultReportFromContext(context)).toEqual(before.report)
      expect(buildLockedPreview(briefs)).toEqual(before.fallback)
    }
  })

  it('does not unlock copy without an existing approved point and source', () => {
    const { briefs } = fixture()
    const brief = briefs.find((item) => item.role === 'work')!
    const source = brief.sourceClaimRefs[0]
    expect(buildCopySemantics({ ...brief, evidenceSummary: [] }, source)).toBeUndefined()
    expect(buildCopySemantics({ ...brief, allowedPoints: [] }, source)).toBeUndefined()
    expect(buildCopySemantics({ ...brief, sourceClaimRefs: [] }, source)).toBeUndefined()
    expect(buildCopySemantics(brief, { ...source, code: 'unknown_claim' })).toBeUndefined()
    expect(buildCopySemantics({ ...brief, allowedPoints: brief.allowedPoints.map((point) =>
      ({ ...point, code: 'unapproved_positive' })) }, source)).toBeUndefined()
    const withoutShadow = buildCopySemantics({ ...brief, shadowPoints: [] }, source)
    expect(withoutShadow?.shadowFramings).toEqual([])
  })

  it('limits surface_support_contrast to identity/contrast with no behavioral framing', () => {
    const { briefs, fallback, plan } = fixture()
    const brief = briefs.find((item) => item.role === 'privateSelf')!
    const source = brief.sourceClaimRefs.find((ref) => ref.code === 'surface_support_contrast')!
    const copy = buildCopySemantics(brief, source)!
    expect(copy.behavioralFramings).toEqual([])
    expect(copy.allowedHeadlineAngles).toEqual(['identity', 'contrast'])
    expect(copy.forbiddenExtensions).toContain('혼자 있을 때의 행동')
    const headline = buildHeadlineBriefs(briefs, fallback, plan).find((item) => item.chapter === 4)!
    expect(headline.copyIntent).toBe('contrast')
    expect(headline.allowedMeanings[0].behavioralFramings).toEqual([])
  })

  it('provides reviewed human wording for the five modes without inventing stronger traits', () => {
    expect(COPY_SEMANTICS_POLICIES.preparation_analysis_focus.positive).toBe('내용을 충분히 살펴보고 정리하려는 방향')
    expect(COPY_SEMANTICS_POLICIES.responsibility_structure_focus.positive).toBe('맡은 역할과 기준을 정리하려는 방향')
    expect(COPY_SEMANTICS_POLICIES.resource_realization_focus.positive).toBe('쓸 수 있는 것을 어디에 둘지 기준을 세우는 방향')
    expect(COPY_SEMANTICS_POLICIES.autonomy_coordination_focus.positive).toBe('자기 기준을 세우면서 주변의 기준과 맞추는 방향')
    expect(COPY_SEMANTICS_POLICIES.expression_production_focus.positive).toBe('표현하려는 것을 결과물로 옮기는 방향')
  })

  it('snapshots fixture 1 deterministic titles, previous short meanings and new copy inputs for manual review', () => {
    const { briefs, fallback, plan } = fixture()
    const headlines = buildHeadlineBriefs(briefs, fallback, plan)
    expect(headlines.map((headline) => {
      const brief = briefs.find((item) => item.chapter === headline.chapter)
      return { chapter: headline.chapter, deterministicTitle: fallback[headline.chapter - 1].title,
        copyIntent: headline.copyIntent, personalized: headline.personalizationAllowed,
        sources: brief?.sourceClaimRefs.map((source) => ({ code: source.code, confidence: source.confidence,
          previousMeaning: brief.allowedPoints.filter((point) => point.source.kind === 'claim'
            && point.source.claimCode === source.code).flatMap((point) => describeHeadlineMeaning(brief, point) ?? []),
          newMeaning: buildCopySemantics(brief, source)?.coreMeaning,
          behavior: buildCopySemantics(brief, source)?.behavioralFramings,
        })) ?? [] }
    })).toMatchSnapshot()
  })
})
