import { describe, expect, it, vi } from 'vitest'
import type { NarrativeJsonClient } from './ai-writer'
import { AiTransportFailure } from './ai-failure'
import { reviewDiagnosticHeadlines } from './headline-review'

vi.mock('astro:env/server', () => ({}))

describe('manual headline diagnostic pipeline', () => {
  it('uses the five existing fixture indices and makes at most one call per selected input', async () => {
    const complete = vi.fn<NarrativeJsonClient['complete']>(async (request) => {
      const input = JSON.parse(request.input)
      expect(input.chapters).toHaveLength(12)
      expect(request.input).not.toMatch(/birthDate|birthTime|evidenceSummary|allowedPoints|payment/)
      return { text: JSON.stringify({ chapters: input.chapters.map((chapter: {
        chapter: number; sourceRefs: string[]; personalizationAllowed: boolean,
      }) => ({ chapter: chapter.chapter, title: `${chapter.chapter}장에서 살펴볼 물음은?`,
        sourceRefs: chapter.personalizationAllowed ? [chapter.sourceRefs[0]] : [],
      })) }), usage: { inputTokens: 100, outputTokens: 200 } }
    })
    const reviews = await reviewDiagnosticHeadlines([1, 5], { complete })
    expect(complete).toHaveBeenCalledTimes(2)
    expect(reviews.map((review) => [review.fixture, review.birthDate])).toEqual([
      [1, '1988-09-13'], [5, '1984-01-24'],
    ])
    expect(reviews.every((review) => review.calls === 1 && review.rows.length === 12
      && review.rows.every((row) => row.status === 'AI'))).toBe(true)
    expect(reviews.every((review) => review.usage?.inputTokens === 100
      && review.model === 'gpt-5.6-luna')).toBe(true)
    expect(reviews.every((review) => review.rows.every((row) =>
      Object.keys(row).join(',') === 'chapter,animalKey,personalization,deterministicTitle,aiTitle,status'))).toBe(true)
    const all = await reviewDiagnosticHeadlines([1, 2, 3, 4, 5], { complete })
    expect(all).toHaveLength(5)
    expect(complete).toHaveBeenCalledTimes(7)
    expect(all.reduce((sum, review) => sum + review.calls, 0)).toBe(5)
  })

  it('records per-chapter fallback and rejects invalid selections without a call', async () => {
    const complete = vi.fn<NarrativeJsonClient['complete']>(async () => ({ text: '{"chapters":[]}' }))
    const reviews = await reviewDiagnosticHeadlines([3], { complete })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(reviews[0]).toMatchObject({ fixture: 3, birthDate: '1992-02-13', calls: 1,
      fallbackChapters: Array.from({ length: 12 }, (_, index) => index + 1),
      missingChapters: Array.from({ length: 12 }, (_, index) => index + 1), rejectedChapters: [] })
    expect(reviews[0].rows.every((row) => row.aiTitle === row.deterministicTitle
      && row.status === 'fallback')).toBe(true)
    await expect(reviewDiagnosticHeadlines([], { complete })).rejects.toThrow(RangeError)
    await expect(reviewDiagnosticHeadlines([1, 1], { complete })).rejects.toThrow(RangeError)
    await expect(reviewDiagnosticHeadlines([6], { complete })).rejects.toThrow(RangeError)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('passes only a safe global provider code and HTTP status to CLI review data', async () => {
    const complete = vi.fn<NarrativeJsonClient['complete']>(async () => {
      throw new AiTransportFailure('provider_http_error', 400,
        { type: 'invalid_request_error', code: 'invalid_json_schema', param: 'text.format.schema' })
    })
    const [review] = await reviewDiagnosticHeadlines([1], { complete })
    expect(review).toMatchObject({ calls: 1, reason: 'provider_http_error', httpStatus: 400,
      providerError: { type: 'invalid_request_error', code: 'invalid_json_schema',
        param: 'text.format.schema' },
      rejectedChapters: [], missingChapters: [] })
    expect(JSON.stringify(review)).not.toMatch(/prompt|response|OPENAI_API_KEY|sourceRef|API key/)
  })
})
