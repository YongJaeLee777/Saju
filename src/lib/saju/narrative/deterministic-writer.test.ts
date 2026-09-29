import { describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import type { SajuInput } from '../types'
import { buildNarrativePlan } from './plan'
import type { NarrativePlan } from './types'
import { buildChapterWritingBriefs } from './writing-brief'
import type { ChapterWritingBrief } from './writing-brief'
import { isPermittedNarrativeText, renderDeterministicNarrative } from './deterministic-writer'

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
const build = (sample: typeof samples[number], date = now) => {
  const context = buildResultNarrativeContext(input(sample), date)
  const plan = buildNarrativePlan(context)
  const briefs = buildChapterWritingBriefs(plan)
  return { context, plan, briefs, chapters: renderDeterministicNarrative(briefs) }
}

describe('Deterministic Narrative Writer v1', () => {
  it('renders only brief-backed chapters and keeps every paragraph traceable', () => {
    for (const sample of samples) {
      const { context, plan, briefs, chapters } = build(sample)
      const originalPlan = structuredClone(plan)
      const originalBriefs = structuredClone(briefs)
      const report = buildResultReportFromContext(context)
      expect(renderDeterministicNarrative(briefs)).toEqual(chapters)
      expect(plan).toEqual(originalPlan)
      expect(briefs).toEqual(originalBriefs)
      expect(buildResultReportFromContext(context)).toEqual(report)
      expect(chapters.map((chapter) => chapter.chapter)).toEqual(briefs.map((brief) => brief.chapter))
      for (const chapter of chapters) {
        const brief = briefs.find((item) => item.chapter === chapter.chapter)!
        expect(chapter.title.length).toBeGreaterThan(0)
        expect(chapter.paragraphs.length).toBeGreaterThan(0)
        expect(chapter.sourceRefs.length).toBeGreaterThan(0)
        expect(chapter.rendererVersion).toBe('deterministic-narrative-writer-v1')
        for (const paragraph of chapter.paragraphs) {
          expect(paragraph.sourceRefs.length).toBeGreaterThan(0)
          expect(chapter.sourceRefs).toEqual(expect.arrayContaining([...paragraph.sourceRefs]))
          for (const ref of paragraph.sourceRefs) {
            if (ref.kind === 'claim') expect(brief.sourceClaimRefs.some((item) => item.code === ref.code
              && item.planField === ref.planField)).toBe(true)
            if (ref.kind === 'motif') expect(ref.code).toBe(brief.motifRef?.code)
            if (ref.kind === 'evidence') expect(brief.evidenceSummary.some((item) => item.factId === ref.factId)).toBe(true)
          }
        }
        const text = `${chapter.title} ${chapter.paragraphs.map((item) => item.text).join(' ')}`
        expect(text).not.toMatch(/실제로|결혼(?:할|합니다)|이별(?:할|합니다)|이직(?:할|합니다)|돈을 (?:벌|얻)/)
        expect(text).not.toMatch(/우울증|불안장애|성격장애|배우자는|타고난 재능|특별한 능력/)
      }
    }
  })

  it('uses a base motif only as an image, and leaves absent chapters absent', () => {
    const { briefs } = build(samples[3])
    const identity = briefs.find((brief) => brief.role === 'coreIdentity')!
    expect(identity.motifRef?.mode).toBe('base')
    const motifOnly: ChapterWritingBrief = { ...identity, sourceClaimRefs: [], allowedPoints: [], shadowPoints: [],
      conditions: [], coreMessage: { kind: 'motif_framing', sourceCodes: [] } }
    const [rendered] = renderDeterministicNarrative([motifOnly])
    expect(rendered.paragraphs.every((paragraph) => paragraph.sourceRefs.every((ref) => ref.kind === 'motif'))).toBe(true)
    expect(rendered.paragraphs.map((paragraph) => paragraph.text).join(' ')).not.toMatch(/성격|재능|책임|분석|표현/)
    expect(renderDeterministicNarrative([])).toEqual([])
  })

  it('renders twelve safe chapters even when the Plan has only its base motif', () => {
    const { plan } = build(samples[3])
    const sparse: NarrativePlan = { methodologyVersion: plan.methodologyVersion, referenceDate: plan.referenceDate,
      referenceYear: plan.referenceYear, annualTargetYear: plan.annualTargetYear,
      coreMetaphor: plan.coreMetaphor, evidence: plan.evidence }
    const briefs = buildChapterWritingBriefs(sparse)
    const chapters = renderDeterministicNarrative(briefs)
    expect(chapters.map((chapter) => chapter.chapter)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(chapters.flatMap((chapter) => chapter.sourceRefs).every((ref) => ref.kind === 'motif')).toBe(true)
    expect(chapters.flatMap((chapter) => chapter.paragraphs.map((paragraph) => paragraph.text)).join(' '))
      .not.toMatch(/성격|재능|능력|실제로|결혼할|이직할/)
  })

  it('separates the 2026 target from a 2027 reference year and avoids relative-year wording', () => {
    const { chapters, briefs } = build(samples[2], new Date('2027-01-01T00:01:00+09:00'))
    const current = chapters.find((chapter) => chapter.chapter === 10)!
    expect(briefs.find((brief) => brief.chapter === 10)?.temporalScope).toMatchObject({
      referenceYear: 2027, annualTargetYear: 2026,
    })
    const text = `${current.title} ${current.paragraphs.map((paragraph) => paragraph.text).join(' ')}`
    expect(text).toContain('2026년')
    expect(text).not.toMatch(/올해|금년|이번 해|2027년을 대상으로/)
    expect(isPermittedNarrativeText(briefs.find((brief) => brief.chapter === 10)!, '올해의 흐름이에요.')).toBe(false)
  })

  it('uses only earlier positive claims in strength and closing', () => {
    const { briefs, chapters } = build(samples[3])
    const strength = chapters.find((chapter) => chapter.chapter === 7)!
    const closing = chapters.find((chapter) => chapter.chapter === 12)!
    const strengthBrief = briefs.find((brief) => brief.chapter === 7)!
    const closingBrief = briefs.find((brief) => brief.chapter === 12)!
    expect(strength.paragraphs.filter((paragraph) => paragraph.sourceRefs.some((ref) => ref.kind === 'claim'))
      .every((paragraph) => paragraph.sourceRefs.some((ref) => ref.kind === 'claim'
        && strengthBrief.sourceClaimRefs.some((item) => item.code === ref.code)))).toBe(true)
    expect(strength.sourceRefs.filter((ref) => ref.kind === 'claim').every((ref) =>
      briefs.some((brief) => brief.chapter < 7 && brief.chapter > 1
        && brief.sourceClaimRefs.some((item) => item.code === ref.code)))).toBe(true)
    expect(closing.sourceRefs.filter((ref) => ref.kind === 'claim').every((ref) =>
      briefs.some((brief) => brief.chapter < 12 && brief.sourceClaimRefs.some((item) => item.code === ref.code)))).toBe(true)
    expect(closingBrief.sourceClaimRefs.every((ref) => closing.sourceRefs.some((item) => item.kind === 'claim'
      && item.code === ref.code))).toBe(true)
  })

  it('drops unknown points and blocks forbidden text without substituting a new claim', () => {
    const { briefs } = build(samples[0])
    const privateBrief = briefs.find((brief) => brief.role === 'privateSelf')!
    const unknown: ChapterWritingBrief = { ...privateBrief, allowedPoints: [{
      code: 'unverified_superpower', source: { kind: 'claim', claimCode: privateBrief.sourceClaimRefs[0].code,
        field: 'positiveSide' },
    }], shadowPoints: [], conditions: [], evidenceSummary: [] }
    expect(renderDeterministicNarrative([unknown])).toEqual([])
    expect(renderDeterministicNarrative([{ ...privateBrief,
      coreMessage: { kind: 'claim_focus', sourceCodes: [] } }])).toEqual([])
    const base = briefs.find((brief) => brief.role === 'coreIdentity')!
    const unsafe: ChapterWritingBrief = { ...base, motifRef: { code: base.motifRef!.code, mode: 'base',
      materialCode: 'standing_tree' }, allowedPoints: [], shadowPoints: [], sourceClaimRefs: [],
      conditions: [], evidenceSummary: [], forbiddenInferences: [...base.forbiddenInferences, 'base_motif_personality'] }
    expect(renderDeterministicNarrative([unsafe])[0].paragraphs.map((item) => item.text).join(' ')).not.toMatch(/성격|재능/)
    const past = briefs.find((brief) => brief.role === 'past')!
    const future = briefs.find((brief) => brief.role === 'future')!
    expect(isPermittedNarrativeText(past, '실제로 이직했어요.')).toBe(false)
    expect(isPermittedNarrativeText(future, '곧 결혼하게 됩니다.')).toBe(false)
    expect(isPermittedNarrativeText(unsafe, '나무처럼 단정적인 성격이에요.', true)).toBe(false)
    expect(isPermittedNarrativeText(future, '타고난 재능이 있어요.')).toBe(false)
    expect(isPermittedNarrativeText(future, '우울증이 있습니다.')).toBe(false)
    expect(isPermittedNarrativeText(future, '돈을 벌게 됩니다.')).toBe(false)
    const relationship = build(samples[4]).briefs.find((brief) => brief.role === 'relationship')!
    expect(isPermittedNarrativeText(relationship, '배우자는 조용한 사람입니다.')).toBe(false)
  })

  it('snapshots titles and short excerpts for five calculated fixtures', () => {
    expect(samples.map((sample) => ({ input: `${sample.birthDate} ${sample.birthTime}`,
      chapters: build(sample).chapters.map((chapter) => ({ chapter: chapter.chapter, title: chapter.title,
        excerpt: chapter.paragraphs.slice(0, 2).map((paragraph) => paragraph.text) })) }))).toMatchSnapshot()
  })
})
