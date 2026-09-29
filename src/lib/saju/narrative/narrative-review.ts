import { buildResultNarrativeContext } from '../server/result-page'
import { buildNarrativePlan } from './plan'
import { buildChapterWritingBriefs } from './writing-brief'
import { renderAiNarrative, AI_NARRATIVE_MODEL } from './ai-writer'
import type { ForbiddenContentRuleId, NarrativeChapterRejectReason, NarrativeJsonClient } from './ai-writer'
import { AiTransportFailure } from './ai-failure'
import type { SafeProviderError } from './ai-failure'
import { NARRATIVE_DIAGNOSTIC_DATE, NARRATIVE_DIAGNOSTIC_INPUTS } from './diagnostic-inputs'

export interface NarrativeReview {
  readonly chapters: readonly { readonly chapter: number; readonly role: string;
    readonly coverageMode: string; readonly title: string; readonly paragraphs: readonly string[];
    readonly status: 'AI' | 'fallback' }[]
  readonly calls: number
  readonly latencyMs: number
  readonly model: string
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null
  readonly fallbackChapters: readonly number[]
  readonly rejectedChapters: readonly number[]
  readonly rejectedChapterReasons: readonly { readonly chapter: number;
    readonly reason: NarrativeChapterRejectReason; readonly ruleIds?: readonly ForbiddenContentRuleId[] }[]
  readonly globalFailureReason: string | null
  readonly httpStatus?: number
  readonly providerError?: SafeProviderError
}

export function formatRejectedChapterReasons(reasons: NarrativeReview['rejectedChapterReasons']): string {
  return reasons.map(({ chapter, reason, ruleIds }) =>
    `${chapter}: ${reason}${ruleIds?.length ? `(${ruleIds.join(', ')})` : ''}`).join(', ') || '없음'
}

/** Dev-only quality review. The same context, Brief, writer and transport
 * contract as paid production are used; no persistence or entitlement code. */
export async function reviewDiagnosticNarrative(fixtureNumber: number,
  client: NarrativeJsonClient): Promise<NarrativeReview> {
  const sample = Number.isInteger(fixtureNumber) ? NARRATIVE_DIAGNOSTIC_INPUTS[fixtureNumber - 1] : undefined
  if (!sample) throw new Error('invalid_fixture')
  const context = buildResultNarrativeContext({ ...sample, calendarType: 'solar', isLeapMonth: false },
    NARRATIVE_DIAGNOSTIC_DATE)
  const briefs = buildChapterWritingBriefs(buildNarrativePlan(context))
  if (briefs.length !== 12 || briefs.some((brief, index) => brief.chapter !== index + 1)) {
    throw new Error('invalid_fixture_coverage')
  }
  let calls = 0
  let providerFailure: string | null = null
  let httpStatus: number | undefined
  let providerError: SafeProviderError | undefined
  let providerUsage: NarrativeReview['usage'] = null
  const received = new Set<number>()
  const rejected = new Map<number, { reason: NarrativeChapterRejectReason;
    ruleIds?: readonly ForbiddenContentRuleId[] }>()
  const counted: NarrativeJsonClient = { async complete(request) {
    calls += 1
    if (calls > 1) throw new Error('call_limit_exceeded')
    try {
      const answer = await client.complete(request)
      providerUsage = answer.usage && Number.isSafeInteger(answer.usage.inputTokens)
        && Number.isSafeInteger(answer.usage.outputTokens) && answer.usage.inputTokens >= 0
        && answer.usage.outputTokens >= 0 ? answer.usage : null
      try {
        const value: unknown = JSON.parse(answer.text)
        if (value && typeof value === 'object' && 'chapters' in value && Array.isArray(value.chapters)) {
          for (const item of value.chapters) if (item && typeof item === 'object' && 'chapter' in item
            && typeof item.chapter === 'number') received.add(item.chapter)
        }
      } catch { /* The production validator handles malformed JSON. */ }
      return answer
    } catch (error) {
      if (error instanceof AiTransportFailure) {
        providerFailure = error.code
        httpStatus = error.httpStatus
        providerError = error.providerError
      }
      throw error
    }
  } }
  const started = performance.now()
  const result = await renderAiNarrative(briefs, counted, undefined, (chapter, reason, details) => {
    rejected.set(chapter, { reason, ...(details ? { ruleIds: details.ruleIds } : {}) })
  })
  const latencyMs = Math.round(performance.now() - started)
  const chapters = briefs.map((brief) => {
    const rendered = result.chapters.find((item) => item.chapter === brief.chapter)
    if (!rendered) throw new Error('missing_rendered_chapter')
    return { chapter: brief.chapter, role: brief.role, coverageMode: brief.coverageMode,
      title: rendered.title, paragraphs: rendered.paragraphs.map((paragraph) => paragraph.text),
      status: rendered.rendererVersion === 'ai-narrative-writer-v2' ? 'AI' as const : 'fallback' as const }
  })
  const fallbackChapters = chapters.filter((chapter) => chapter.status === 'fallback').map((chapter) => chapter.chapter)
  return { chapters, calls, latencyMs, model: AI_NARRATIVE_MODEL, usage: result.usage ?? providerUsage,
    fallbackChapters,
    rejectedChapters: fallbackChapters.filter((chapter) => received.has(chapter)),
    rejectedChapterReasons: [...rejected].sort(([left], [right]) => left - right)
      .map(([chapter, details]) => ({ chapter, ...details })),
    globalFailureReason: result.mode === 'deterministic'
      ? result.reason === 'timeout' ? 'provider_timeout' : providerFailure ?? result.reason : null,
    ...(result.mode === 'deterministic' && httpStatus !== undefined ? { httpStatus } : {}),
    ...(result.mode === 'deterministic' && providerError ? { providerError } : {}) }
}

export const reviewFixtureOneNarrative = (client: NarrativeJsonClient): Promise<NarrativeReview> =>
  reviewDiagnosticNarrative(1, client)
