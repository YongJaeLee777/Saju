import { buildResultNarrativeContext } from '../server/result-page'
import type { SajuInput } from '../types'
import { writeAiLockedHeadlines } from './ai-headline-writer'
import { AI_WRITER_MODEL } from './ai-model'
import type { NarrativeJsonClient } from './ai-writer'
import type { SafeProviderError } from './ai-failure'
import { NARRATIVE_DIAGNOSTIC_DATE, NARRATIVE_DIAGNOSTIC_INPUTS } from './diagnostic-inputs'
import { buildHeadlineBriefs } from './headline-brief'
import { buildLockedPreview } from './locked-preview'
import { buildNarrativePlan } from './plan'
import { buildChapterWritingBriefs } from './writing-brief'

export interface HeadlineReview {
  readonly fixture: number
  readonly birthDate: string
  readonly birthTime: string
  readonly rows: readonly { readonly chapter: number; readonly animalKey: string;
    readonly personalization: 'personalized' | 'neutral'; readonly deterministicTitle: string;
    readonly aiTitle: string; readonly status: 'AI' | 'fallback' }[]
  readonly fallbackChapters: readonly number[]
  readonly rejectedChapters: readonly number[]
  readonly missingChapters: readonly number[]
  readonly calls: number
  readonly latencyMs: number
  readonly model: string
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null
  readonly reason?: string
  readonly httpStatus?: number
  readonly providerError?: SafeProviderError
}

/** Explicit fixture indices only; sequential and at most one transport call each. */
export async function reviewDiagnosticHeadlines(
  fixtureNumbers: readonly number[], client: NarrativeJsonClient,
): Promise<readonly HeadlineReview[]> {
  if (!fixtureNumbers.length || fixtureNumbers.length > NARRATIVE_DIAGNOSTIC_INPUTS.length
    || new Set(fixtureNumbers).size !== fixtureNumbers.length
    || fixtureNumbers.some((number) => !Number.isInteger(number) || number < 1
      || number > NARRATIVE_DIAGNOSTIC_INPUTS.length)) throw new RangeError('Invalid diagnostic fixture selection')
  const reviews: HeadlineReview[] = []
  for (const fixture of fixtureNumbers) {
    const sample = NARRATIVE_DIAGNOSTIC_INPUTS[fixture - 1]
    const input: SajuInput = { ...sample, calendarType: 'solar', isLeapMonth: false }
    const context = buildResultNarrativeContext(input, NARRATIVE_DIAGNOSTIC_DATE)
    const plan = buildNarrativePlan(context)
    const writingBriefs = buildChapterWritingBriefs(plan)
    const deterministic = buildLockedPreview(writingBriefs)
    const headlineBriefs = buildHeadlineBriefs(writingBriefs, deterministic, plan)
    let calls = 0
    const counted: NarrativeJsonClient = { complete(request) {
      calls += 1
      return client.complete(request)
    } }
    const started = performance.now()
    const result = await writeAiLockedHeadlines(headlineBriefs, deterministic, counted)
    const latencyMs = Math.round(performance.now() - started)
    const accepted = new Set(result.acceptedChapters)
    reviews.push({ fixture, birthDate: sample.birthDate, birthTime: sample.birthTime,
      rows: deterministic.map((chapter, index) => ({ chapter: chapter.chapter,
        animalKey: chapter.animalKey,
        personalization: headlineBriefs[index].personalizationAllowed ? 'personalized' : 'neutral',
        deterministicTitle: chapter.title, aiTitle: result.chapters[index].title,
        status: accepted.has(chapter.chapter) ? 'AI' : 'fallback',
      })),
      fallbackChapters: deterministic.filter((chapter) => !accepted.has(chapter.chapter)).map((chapter) => chapter.chapter),
      rejectedChapters: result.rejectedChapters, missingChapters: result.missingChapters,
      calls, latencyMs, model: AI_WRITER_MODEL, usage: result.usage,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
      ...(result.providerError ? { providerError: result.providerError } : {}),
    })
  }
  return reviews
}
