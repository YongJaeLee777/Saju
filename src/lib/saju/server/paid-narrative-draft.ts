import 'astro:env/server'
import { buildResultNarrativeContext, buildResultReportFromContext } from './result-page'
import { buildNarrativePlan } from '../narrative/plan'
import { buildChapterWritingBriefs } from '../narrative/writing-brief'
import type { SajuInput } from '../types'

/** Freeze only server-side writing inputs at purchase time. No AI or secrets. */
export function buildPaidNarrativeDraft(input: SajuInput, now: Date) {
  const context = buildResultNarrativeContext(input, now)
  const draft = buildResultReportFromContext(context)
  const briefs = buildChapterWritingBriefs(buildNarrativePlan(context))
  return { ...draft, report: { ...draft.report,
    paidNarrative: { version: 'paid-narrative-v1' as const, state: 'pending' as const, briefs } } }
}
