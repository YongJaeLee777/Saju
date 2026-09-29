import { describe, expect, it, vi } from 'vitest'
import { AiTransportFailure } from './ai-failure'
import { AI_NARRATIVE_MODEL } from './ai-writer'
import { buildAiNarrativeRequest } from './ai-writer'
import type { NarrativeJsonClient } from './ai-writer'
import { formatRejectedChapterReasons, reviewDiagnosticNarrative, reviewFixtureOneNarrative } from './narrative-review'
import { NARRATIVE_DIAGNOSTIC_DATE, NARRATIVE_DIAGNOSTIC_INPUTS } from './diagnostic-inputs'
import { buildResultNarrativeContext } from '../server/result-page'
import { buildNarrativePlan } from './plan'
import { buildChapterWritingBriefs } from './writing-brief'

vi.mock('astro:env/server', () => ({}))

function oneValidChapter(input: string, invalidBridge = false, invalidChapter = 3) {
  const chapters = JSON.parse(input).chapters
  const motif = chapters[1].motifRef.code
  const sourceRefs = [{ kind: 'motif', code: motif }]
  const valid = { chapter: 2, title: '다듬어진 금속에서 이야기를 시작해요',
    paragraphs: [{ text: '이 이미지는 이야기를 여는 비유로만 놓아둘게요.', sourceRefs }], sourceRefs }
  const invalid = { chapter: invalidChapter, title: '근거 없이 지은 제목',
    paragraphs: [{ text: '사람들이 당신을 잘 안다고 생각해요.',
      sourceRefs: [{ kind: 'claim', code: 'c999' }] }],
    sourceRefs: [{ kind: 'claim', code: 'c999' }] }
  return JSON.stringify({ chapters: invalidBridge ? [valid, invalid] : [valid] })
}

describe('dev narrative review', () => {
  it('keeps the relevant fixture 3 and 5 validation scopes visible in code', () => {
    const briefs = (fixture: number) => buildChapterWritingBriefs(buildNarrativePlan(
      buildResultNarrativeContext({ ...NARRATIVE_DIAGNOSTIC_INPUTS[fixture - 1],
        calendarType: 'solar', isLeapMonth: false }, NARRATIVE_DIAGNOSTIC_DATE)))
    const third = briefs(3)
    const fifth = briefs(5)
    expect(third[5].role).toBe('work')
    expect(third[6].role).toBe('strengthInUse')
    expect(third[5].forbiddenInferences).toContain('unverified_ability')
    expect(third[6].forbiddenInferences).toContain('unverified_ability')
    expect(third[8]).toMatchObject({ role: 'past', coverageMode: 'primary' })
    expect(third[8].temporalScope).toBeDefined()
    expect(fifth[8]).toMatchObject({ role: 'past', coverageMode: 'neutral_bridge' })
    expect(fifth[8].temporalScope).toBeUndefined()
  })

  it('selects each existing diagnostic fixture and calls the writer once', async () => {
    for (const [index, sample] of NARRATIVE_DIAGNOSTIC_INPUTS.entries()) {
      const complete = vi.fn(async (_request: Parameters<NarrativeJsonClient['complete']>[0]) => ({ text: '{' }))
      const review = await reviewDiagnosticNarrative(index + 1, { complete })
      const context = buildResultNarrativeContext({ ...sample, calendarType: 'solar', isLeapMonth: false },
        NARRATIVE_DIAGNOSTIC_DATE)
      const expected = buildAiNarrativeRequest(buildChapterWritingBriefs(buildNarrativePlan(context)))
      expect(complete).toHaveBeenCalledTimes(1)
      expect(complete.mock.calls[0][0].input).toBe(expected.input)
      expect(review.calls).toBe(1)
    }
  })

  it('rejects invalid fixture numbers before any writer call', async () => {
    const complete = vi.fn(async (_request: Parameters<NarrativeJsonClient['complete']>[0]) => ({ text: '{' }))
    for (const invalid of [0, 6, -1, 1.5, Number.NaN]) {
      await expect(reviewDiagnosticNarrative(invalid, { complete })).rejects.toThrow('invalid_fixture')
    }
    expect(complete).not.toHaveBeenCalled()
  })

  it('uses the production Brief and writer once, returning only readable chapter output', async () => {
    const complete = vi.fn(async (request: Parameters<NarrativeJsonClient['complete']>[0]) => ({
      text: oneValidChapter(request.input), usage: { inputTokens: 120, outputTokens: 300 },
    }))
    const review = await reviewFixtureOneNarrative({ complete })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0].model).toBe(AI_NARRATIVE_MODEL)
    expect(complete.mock.calls[0][0].instructions).toContain('neutral_bridge')
    expect(JSON.parse(complete.mock.calls[0][0].input).chapters).toHaveLength(12)
    expect(review).toMatchObject({ calls: 1, model: AI_NARRATIVE_MODEL,
      usage: { inputTokens: 120, outputTokens: 300 }, globalFailureReason: null,
      rejectedChapters: [] })
    expect(review.chapters.map((chapter) => chapter.chapter)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(review.chapters[1].status).toBe('AI')
    expect(review.fallbackChapters).not.toContain(2)
    expect(review.fallbackChapters).toHaveLength(11)
    expect(JSON.stringify(review)).not.toMatch(/sourceRefs|evidenceSummary|allowedPoints|OPENAI_API_KEY|1988-09-13/)
  })

  it('distinguishes rejected chapters from missing chapters without exposing provider content', async () => {
    const review = await reviewFixtureOneNarrative({ complete: async (request) => ({
      text: oneValidChapter(request.input, true),
    }) })
    expect(review.rejectedChapters).toEqual([3])
    expect(review.rejectedChapterReasons).toEqual([{ chapter: 3, reason: 'invalid_source_ref' }])
    expect(review.fallbackChapters).toContain(3)
    expect(review.chapters[1].status).toBe('AI')
  })

  it('reports a safe chapter 9 reject code without exposing text or aliases', async () => {
    const review = await reviewFixtureOneNarrative({ complete: async (request) => ({
      text: oneValidChapter(request.input, true, 9),
    }) })
    expect(review.rejectedChapters).toEqual([9])
    expect(review.rejectedChapterReasons).toEqual([{ chapter: 9, reason: 'invalid_source_ref' }])
    expect(JSON.stringify(review)).not.toContain('c999')
  })

  it('reports multiple safe rule IDs for a rejected past chapter and keeps partial fallback', async () => {
    const unsafe = '지난 시기에는 실제로 이직했어요. 흐름이 변화했어요.'
    let motifAlias = ''
    const review = await reviewDiagnosticNarrative(5, { complete: async (request) => {
      const projected = JSON.parse(request.input).chapters
      motifAlias = projected[8].motifRef.code
      const refs = [{ kind: 'motif', code: motifAlias }]
      const accepted = JSON.parse(oneValidChapter(request.input)).chapters[0]
      return { text: JSON.stringify({ chapters: [accepted, { chapter: 9, title: '지난 흐름',
        paragraphs: [{ text: unsafe, sourceRefs: refs }], sourceRefs: refs }] }) }
    } })
    expect(review.chapters[1].status).toBe('AI')
    expect(review.chapters[8].status).toBe('fallback')
    expect(review.rejectedChapterReasons).toEqual([{ chapter: 9, reason: 'forbidden_content',
      ruleIds: expect.arrayContaining(['actual_past_event', 'temporal_scope_without_claim']) }])
    expect(formatRejectedChapterReasons(review.rejectedChapterReasons))
      .toMatch(/^9: forbidden_content\([a-z_, ]+\)$/)
    expect(JSON.stringify(review)).not.toContain(unsafe)
    expect(JSON.stringify(review)).not.toContain(motifAlias)
    expect(formatRejectedChapterReasons(review.rejectedChapterReasons)).not.toContain(unsafe)
  })

  it('identifies the existing ability gate for fixture 3 work and strength chapters', async () => {
    const review = await reviewDiagnosticNarrative(3, { complete: async (request) => {
      const projected = JSON.parse(request.input).chapters
      const accepted = JSON.parse(oneValidChapter(request.input)).chapters[0]
      const rejected = [6, 7].map((number) => {
        const chapter = projected[number - 1]
        const code = chapter.primarySourceRefs[0] ?? chapter.secondarySourceRefs[0]
        const refs = [{ kind: 'claim', code }]
        return { chapter: number, title: '일의 방향',
          paragraphs: [{ text: '타고난 재능이 있어요.', sourceRefs: refs }], sourceRefs: refs }
      })
      return { text: JSON.stringify({ chapters: [accepted, ...rejected] }) }
    } })
    expect(review.chapters[1].status).toBe('AI')
    expect(review.chapters[5].status).toBe('fallback')
    expect(review.chapters[6].status).toBe('fallback')
    expect(review.rejectedChapterReasons).toEqual([
      { chapter: 6, reason: 'forbidden_content', ruleIds: ['unverified_ability'] },
      { chapter: 7, reason: 'forbidden_content', ruleIds: ['unverified_ability'] },
    ])
    expect(JSON.stringify(review)).not.toContain('타고난 재능이 있어요.')
  })

  it('reports a safe global failure after one transport attempt', async () => {
    const complete = vi.fn(async () => { throw new AiTransportFailure('provider_http_error', 400,
      { type: 'invalid_request_error', code: 'invalid_json_schema', param: 'text.format.schema' }) })
    const review = await reviewFixtureOneNarrative({ complete })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(review).toMatchObject({ calls: 1, globalFailureReason: 'provider_http_error',
      httpStatus: 400, providerError: { type: 'invalid_request_error', code: 'invalid_json_schema',
        param: 'text.format.schema' }, rejectedChapters: [], usage: null })
    expect(review.fallbackChapters).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(JSON.stringify(review)).not.toMatch(/error\.message|response body|prompt|API_KEY/)
  })

  it('reports a timed transport failure with one attempt and deterministic fallback', async () => {
    const complete = vi.fn(async () => { throw new AiTransportFailure('provider_timeout') })
    const review = await reviewFixtureOneNarrative({ complete })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(review.globalFailureReason).toBe('provider_timeout')
    expect(review.fallbackChapters).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(review.rejectedChapters).toEqual([])
    expect(review.rejectedChapterReasons).toEqual([])
  })
})
