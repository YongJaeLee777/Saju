import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildResultPageView, buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import { buildPaidNarrativeDraft } from '../server/paid-narrative-draft'
import { buildNarrativePlan } from './plan'
import { buildFreeHook } from './free-hook'
import { buildChapterWritingBriefs } from './writing-brief'
import { renderDeterministicNarrative } from './deterministic-writer'
import { NARRATIVE_DIAGNOSTIC_DATE as now, NARRATIVE_DIAGNOSTIC_INPUTS } from './diagnostic-inputs'
import type { NarrativePlan } from './types'

vi.mock('astro:env/server', () => ({}))
afterEach(() => vi.unstubAllGlobals())
const input = (index = 0) => ({ ...NARRATIVE_DIAGNOSTIC_INPUTS[index], calendarType: 'solar' as const, isLeapMonth: false })
const planFor = (index = 0) => buildNarrativePlan(buildResultNarrativeContext(input(index), now))

describe('deterministic free hook', () => {
  it('keeps real claim confidence and provenance across diagnostic inputs with zero network calls', () => {
    const network = vi.fn(() => { throw new Error('No free network calls') })
    vi.stubGlobal('fetch', network)
    for (let i = 0; i < 5; i++) {
      const plan = planFor(i)
      const before = structuredClone(plan)
      const hook = buildFreeHook(plan)
      expect(buildFreeHook(plan)).toEqual(hook)
      const claims = [plan.primaryTension, ...(plan.hook ?? []), ...(plan.work ?? []), ...(plan.relationship ?? []),
        ...(plan.socialSelf ?? []), ...(plan.hiddenStrength ?? []), ...(plan.recurringPattern ?? [])]
      if (hook.sourceRefs[0]?.startsWith('claim:')) {
        const source = claims.find((claim) => `claim:${claim?.code}` === hook.sourceRefs[0])!
        expect(source.confidence).toBe(hook.confidence)
        expect(source.evidence.length).toBeGreaterThan(0)
      }
      expect(plan).toEqual(before)
      expect(hook.text).not.toMatch(/준비와 분석|책임과 구조|재물운|반드시|불안|후회|번아웃/)
      const view = buildResultPageView(input(i), true, now)
      expect(view.freeHook).toEqual({ text: hook.text })
      const paid = renderDeterministicNarrative(buildChapterWritingBriefs(plan))
      for (const chapter of paid) {
        expect(JSON.stringify(view)).not.toContain(chapter.title)
        for (const paragraph of chapter.paragraphs) expect(JSON.stringify(view)).not.toContain(paragraph.text)
      }
      expect(JSON.stringify(view)).not.toMatch(/sourceRefs|confidence|evidence|paidNarrative|snapshot|report_json|allowedPoints/)
    }
    expect(network).not.toHaveBeenCalled()
  })

  it('prefers strong tension, then strong/medium behavior without promoting confidence', () => {
    const tension = planFor(3)
    expect(buildFreeHook(tension).sourceRefs).toEqual([`claim:${tension.primaryTension!.code}`])
    const plan = planFor()
    const claim = plan.work![0]
    const isolated: NarrativePlan = { ...plan, primaryTension: undefined, hook: [], socialSelf: [], privateSelf: [],
      relationship: [], hiddenStrength: [], recurringPattern: [], work: [claim] }
    expect(buildFreeHook(isolated).sourceRefs).toEqual([`claim:${claim.code}`])
    expect(buildFreeHook({ ...isolated, work: [{ ...claim, confidence: 'medium' }] }).confidence).toBe('medium')
    expect(buildFreeHook({ ...isolated, work: [{ ...claim, confidence: 'strong' }] }).confidence).toBe('strong')
    expect(buildFreeHook({ ...isolated, evidence: [] })).toEqual(buildFreeHook())
  })

  it('permits contextual framing only after behavioral candidates, with safe no-data fallback', () => {
    const plan = Array.from({ length: 5 }, (_, i) => planFor(i)).find((item) => item.coreMetaphor.mode === 'contextual')!
    const sparse = { ...plan, primaryTension: undefined, hook: [], socialSelf: [], privateSelf: [],
      work: [], relationship: [], hiddenStrength: [], recurringPattern: [] }
    expect(buildFreeHook(sparse).sourceRefs).toEqual([`motif:${plan.coreMetaphor.code}`])
    expect(buildFreeHook()).toMatchObject({ confidence: 'fallback', sourceRefs: [] })
    expect(buildFreeHook({ ...sparse, evidence: [] })).toEqual(buildFreeHook())
  })

  it('freezes the existing briefs in the paid draft without changing the deterministic report', () => {
    const context = buildResultNarrativeContext(input(), now)
    const baseline = buildResultReportFromContext(context)
    const draft = buildPaidNarrativeDraft(input(), now)
    const { paidNarrative, ...report } = draft.report
    expect(report).toEqual(baseline.report)
    expect(paidNarrative.briefs).toEqual(buildChapterWritingBriefs(buildNarrativePlan(context)))
    expect(paidNarrative.state).toBe('pending')
  })

  it('has no headline, copy or AI dependency in the free composition', () => {
    const service = readFileSync(new URL('../server/result-page.ts', import.meta.url), 'utf8')
    const hook = readFileSync(new URL('./free-hook.ts', import.meta.url), 'utf8')
    expect(service + hook).not.toMatch(/headline-brief|ai-headline|copy-semantics|openai|ai-writer|locked-preview|writing-brief/)
    const page = readFileSync(new URL('../../../pages/result/[id].astro', import.meta.url), 'utf8')
    expect(page).not.toMatch(/localStorage|locked-chapter|animal-marker|blur\(/)
    expect(page).toContain('카카오페이')
    expect(page).toContain('id="purchase-report"')
  })
})
