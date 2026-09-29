import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultPageData, buildResultPageView } from '../server/result-page'
import type { SajuInput } from '../types'
import { renderDeterministicNarrative } from './deterministic-writer'
import { buildLockedPreview } from './locked-preview'
import { buildNarrativePlan } from './plan'
import { buildChapterWritingBriefs } from './writing-brief'

vi.mock('astro:env/server', () => ({}))

const input: SajuInput = { birthDate: '1988-09-13', birthTime: '13:04', gender: 'female',
  calendarType: 'solar', isLeapMonth: false }
const now = new Date('2026-09-13T00:00:00+09:00')
const animals = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake',
  'horse', 'sheep', 'monkey', 'rooster', 'dog', 'pig']

describe('12 chapter locked preview', () => {
  it('projects all animals in order and never includes Brief, evidence, or paid body fields', () => {
    const briefs = buildChapterWritingBriefs(buildNarrativePlan(buildResultNarrativeContext(input, now)))
    const preview = buildLockedPreview(briefs)
    expect(preview).toEqual(buildLockedPreview(briefs))
    expect(preview.map((item) => item.chapter)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
    expect(preview.map((item) => item.animalKey)).toEqual(animals)
    expect(preview.every((item) => item.locked && item.title.length > 0 && item.title.length <= 48)).toBe(true)
    expect(new Set(preview.map((item) => item.title)).size).toBe(12)
    expect(preview.every((item) => Object.keys(item).join(',') === 'chapter,animalKey,title,locked')).toBe(true)
    expect(preview.some((item) => item.title !== buildLockedPreview([])[item.chapter - 1].title)).toBe(true)
    expect(JSON.stringify(preview)).not.toMatch(/paragraph|allowedPoints|shadowPoints|evidence|snapshot|buyer|payment|sourceClaimRefs/)
    expect(preview.map((item) => item.title)).not.toContain('성격')
    expect(preview.map((item) => item.title)).not.toContain('연애운')
    expect(preview.map((item) => item.title)).not.toContain('직업운')
  })

  it('keeps unsupported chapters neutral without manufacturing a claim or teaser', () => {
    const empty = buildLockedPreview([])
    expect(empty).toHaveLength(12)
    expect(empty.every((item) => item.locked && !('teaser' in item))).toBe(true)
    const briefs = buildChapterWritingBriefs(buildNarrativePlan(buildResultNarrativeContext(input, now)))
    const sparse = buildLockedPreview(briefs.filter((brief) => brief.chapter !== 5))
    expect(sparse[4]).toEqual(empty[4])
  })

  it('keeps the archived preview out of the production free DTO', () => {
    const free = buildResultPageView(input, true, now)
    const paid = buildResultPageView(input, false, now)
    const briefs = buildChapterWritingBriefs(buildNarrativePlan(buildResultNarrativeContext(input, now)))
    const paidParagraphs = renderDeterministicNarrative(briefs).flatMap((chapter) =>
      chapter.paragraphs.map((paragraph) => paragraph.text))
    const serialized = JSON.stringify(free)
    expect(free.page).toEqual(buildResultPageData(input, now))
    expect(Object.keys(free.freeHook!)).toEqual(['text'])
    expect(free).not.toHaveProperty('lockedPreview')
    expect(paid).toEqual({ page: free.page, freeHook: null })
    for (const chapter of buildLockedPreview(briefs)) expect(serialized).not.toContain(chapter.title)
    expect(paidParagraphs.length).toBeGreaterThan(0)
    for (const paragraph of paidParagraphs) expect(serialized).not.toContain(paragraph)
    expect(serialized).not.toMatch(/report_json|snapshot|rendererVersion|sourceClaimRefs|allowedPoints|shadowPoints|evidenceSummary/)
  })

  it('renders only the hook and CTA in the free branch and keeps the paid snapshot branch', () => {
    const page = readFileSync(new URL('../../../pages/result/[id].astro', import.meta.url), 'utf8')
    const freeBranch = page.split('</> : <>').at(-1)!.split('</>}')[0]
    expect(freeBranch).toContain('{freeHook?.text}')
    expect(freeBranch).toContain('1,000원')
    expect(page).not.toMatch(/lockedPreview|locked-placeholder|animal-marker|blur\(/)
    expect(freeBranch).toContain('id="purchase-report"')
    expect(freeBranch).not.toMatch(/section\.body|paid\.report|renderDeterministicNarrative|renderAiNarrative|localStorage/)
    expect(page).not.toContain('id="report-heading"')
    expect(page).toContain('{paid.entitled ? <>')
    expect(page).not.toMatch(/legacy-report|주제별로 살펴보는 나의 흐름|2026년 상세 리포트/)
    expect(page).toContain('{paid.report.sections.map')
    expect(page).toContain('section.body.split')
    expect(page).toContain('id="paid-generation"')
    expect(page).toContain('12가지 흐름을 하나씩 정리하고 있습니다.')
  })
})
