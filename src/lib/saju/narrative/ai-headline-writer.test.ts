import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildResultNarrativeContext, buildResultReportFromContext } from '../server/result-page'
import type { SajuInput } from '../types'
import { AI_HEADLINE_TIMEOUT_MS, writeAiLockedHeadlines } from './ai-headline-writer'
import { AiTransportFailure } from './ai-failure'
import type { NarrativeJsonClient } from './ai-writer'
import { renderDeterministicNarrative } from './deterministic-writer'
import { buildHeadlineBriefs } from './headline-brief'
import { buildLockedPreview } from './locked-preview'
import { buildNarrativePlan } from './plan'
import { buildChapterWritingBriefs } from './writing-brief'

vi.mock('astro:env/server', () => ({}))
afterEach(() => vi.useRealTimers())

const samples = [
  { birthDate: '1988-09-13', birthTime: '13:04', gender: 'female' },
  { birthDate: '1973-11-13', birthTime: '13:04', gender: 'female' },
  { birthDate: '1984-01-24', birthTime: '13:04', gender: 'female' },
] as const
const now = new Date('2026-09-13T00:00:00+09:00')
const fixture = (sample: typeof samples[number] = samples[0]) => {
  const input: SajuInput = { ...sample, calendarType: 'solar', isLeapMonth: false }
  const context = buildResultNarrativeContext(input, now)
  const plan = buildNarrativePlan(context)
  const writingBriefs = buildChapterWritingBriefs(plan)
  const fallback = buildLockedPreview(writingBriefs)
  const headlineBriefs = buildHeadlineBriefs(writingBriefs, fallback, plan)
  return { context, plan, writingBriefs, fallback, headlineBriefs }
}
const neutralTitles: Record<number, string> = {
  1: '첫 장에서 무엇을 살펴볼까?', 2: '이미지에서 시작되는 물음',
  3: '사람들 사이에서는 어떤 모습일까?', 4: '혼자일 때는 무엇을 살필까?',
  5: '가까운 사이에서 살펴볼 지점은?', 6: '일에서는 무엇을 살펴볼까?',
  7: '장점이 되는 순간을 묻는다면?', 8: '반복되는 선택에는 무엇이 있을까?',
  9: '지나온 흐름에서 살펴볼 것은?', 10: '2026년의 흐름에서 묻는다면?',
  11: '다음 흐름에서는 무엇을 살펴볼까?', 12: '끝에서 다시 떠올릴 것은?',
}
function response(briefs: ReturnType<typeof fixture>['headlineBriefs']) {
  return { chapters: briefs.map((brief) => {
    const meaning = brief.allowedMeanings[0]?.positive[0] ?? brief.motifFraming?.image
    return { chapter: brief.chapter,
      title: meaning ? `${Array.from(meaning).slice(0, 21).join('')}, ${brief.chapter}장의 물음은?`
        : neutralTitles[brief.chapter],
      sourceRefs: brief.personalizationAllowed ? [brief.sourceRefs[0]] : [],
    }
  }) }
}
const client = (value: unknown): NarrativeJsonClient => ({ complete: vi.fn().mockResolvedValue({
  text: typeof value === 'string' ? value : JSON.stringify(value),
  usage: { inputTokens: 200, outputTokens: 400 },
}) })

describe('AI Headline Writer v1', () => {
  it('makes one bounded call for 12 titles and projects approved meaning without paid text', async () => {
    const { context, plan, writingBriefs, fallback, headlineBriefs } = fixture()
    const before = { plan: structuredClone(plan), writingBriefs: structuredClone(writingBriefs),
      report: buildResultReportFromContext(context) }
    const mock = client(response(headlineBriefs))
    const result = await writeAiLockedHeadlines(headlineBriefs, fallback, mock)
    expect(result.mode).toBe('ai')
    expect(result.acceptedChapters).toHaveLength(12)
    expect(result.chapters.map((chapter) => chapter.animalKey)).toEqual(fallback.map((chapter) => chapter.animalKey))
    expect(result.chapters.every((chapter) => Object.keys(chapter).join(',') === 'chapter,animalKey,title,locked')).toBe(true)
    expect(mock.complete).toHaveBeenCalledTimes(1)
    const request = vi.mocked(mock.complete).mock.calls[0][0]
    expect(request.model).toBe('gpt-5.6-luna')
    expect(request.jsonSchema).toMatchObject({ name: 'saju_headlines_v1', schema: {
      type: 'object', required: ['chapters'], additionalProperties: false,
      properties: { chapters: { type: 'array', items: {
        type: 'object', required: ['chapter', 'title', 'sourceRefs'], additionalProperties: false,
        properties: { chapter: { type: 'integer' }, title: { type: 'string' },
          sourceRefs: { type: 'array', items: { type: 'string' } } },
      } } },
    } })
    expect(request.maxOutputTokens).toBeLessThan(3000)
    expect(request.input.length).toBeLessThan(24000)
    const prompt = JSON.parse(request.input)
    expect(prompt.chapters).toHaveLength(12)
    expect(prompt.chapters[2]).toMatchObject({ personalizationAllowed: false, sourceRefs: [] })
    expect(prompt.chapters[1].motifFraming).toBeDefined()
    expect(request.instructions).toContain('base motif')
    expect(request.instructions).toContain('forbiddenInferences')
    expect(request.instructions).toContain('CopySemantics v1')
    expect(request.instructions).toContain('질문형을 기본값으로 쓰지 마세요')
    expect(request.instructions).toContain('behavioralFramings가 비어 있으면 행동으로 확장하지 마세요')
    expect(request.instructions).toContain('copyIntent는 서버가 정한 제목 문법')
    expect(request.input).not.toMatch(/준비와 분석|책임과 구조|자원 선택과 현실화|표현과 생산/)
    expect(request.instructions).toContain('code label을 제목에 그대로 복사하지 마세요')
    expect(request.instructions).toContain('무엇을 비추나·시선은 어디에')
    expect(request.instructions).toContain('탐색형 질문을 쓰세요')
    expect(request.instructions).toContain('그 사람의 성향·행동·경험을 단정하지 마세요')
    expect(request.instructions).toContain('입력에 없는 행동이나 상태는 덧붙이지 마세요')
    expect(request.input).not.toContain(samples[0].birthDate)
    expect(request.input).not.toContain(writingBriefs[0].evidenceSummary[0].factId)
    expect(request.input).not.toMatch(/birthDate|birthTime|allowedPoints|shadowPoints|evidenceSummary|payment|buyer|report_json/)
    for (const paragraph of renderDeterministicNarrative(writingBriefs).flatMap((chapter) =>
      chapter.paragraphs.map((item) => item.text))) expect(request.input).not.toContain(paragraph)
    expect(plan).toEqual(before.plan)
    expect(writingBriefs).toEqual(before.writingBriefs)
    expect(buildResultReportFromContext(context)).toEqual(before.report)
  })

  it('falls back only missing, invalid-reference, duplicated, and unsafe neutral chapters', async () => {
    const { fallback, headlineBriefs } = fixture()
    const value = response(headlineBriefs)
    value.chapters = value.chapters.filter((chapter) => chapter.chapter !== 5)
    value.chapters.find((chapter) => chapter.chapter === 6)!.sourceRefs = ['unknown']
    value.chapters.find((chapter) => chapter.chapter === 3)!.title = '당신은 섬세한 사람이에요'
    value.chapters.push({ ...value.chapters.find((chapter) => chapter.chapter === 8)! })
    const withExtra = { chapters: [...value.chapters, { chapter: 13, title: '추가 장', sourceRefs: [] }] }
    const result = await writeAiLockedHeadlines(headlineBriefs, fallback, client(withExtra))
    expect(result.mode).toBe('mixed')
    for (const chapter of [3, 5, 6, 8]) expect(result.chapters[chapter - 1]).toEqual(fallback[chapter - 1])
    expect(result.acceptedChapters).not.toContain(13)
    expect(result.acceptedChapters).toContain(1)
  })

  it('rejects base motif personality claims and preserves the 2026 scope', async () => {
    const { fallback, headlineBriefs } = fixture()
    expect(headlineBriefs[1].motifFraming?.mode).toBe('base')
    expect(headlineBriefs[9].temporalScope).toMatchObject({ annualTargetYear: 2026 })
    const value = response(headlineBriefs)
    value.chapters[1].title = '다듬어진 금속처럼 섬세한 당신'
    value.chapters[9].title = '올해의 방향은 어디로 갈까?'
    const result = await writeAiLockedHeadlines(headlineBriefs, fallback, client(value))
    expect(result.chapters[1]).toEqual(fallback[1])
    expect(result.chapters[9]).toEqual(fallback[9])
    expect(result.chapters[0]).not.toEqual(fallback[0])
  })

  it('rejects markup and oversized prompts before a billable call', async () => {
    const { fallback, headlineBriefs } = fixture()
    const unsafe = response(headlineBriefs)
    unsafe.chapters[0].title = '<strong>당신의 이야기</strong>'
    expect((await writeAiLockedHeadlines(headlineBriefs, fallback, client(unsafe))).chapters[0]).toEqual(fallback[0])
    const oversized = headlineBriefs.map((brief, index) => index === 0 ? {
      ...brief, allowedMeanings: [{ ...brief.allowedMeanings[0], positive: ['가'.repeat(25000)] }],
    } : brief)
    const mock = client(response(headlineBriefs))
    expect(await writeAiLockedHeadlines(oversized, fallback, mock)).toMatchObject({
      mode: 'deterministic', reason: 'input-too-large', chapters: fallback,
    })
    expect(mock.complete).not.toHaveBeenCalled()
  })

  it('uses all deterministic titles for malformed JSON, timeout, and provider failure', async () => {
    const { fallback, headlineBriefs } = fixture()
    expect(await writeAiLockedHeadlines(headlineBriefs, fallback, client('{')))
      .toMatchObject({ mode: 'deterministic', chapters: fallback, reason: 'invalid_json' })
    const failure: NarrativeJsonClient = { complete: vi.fn().mockRejectedValue(new Error('503')) }
    expect(await writeAiLockedHeadlines(headlineBriefs, fallback, failure))
      .toMatchObject({ mode: 'deterministic', chapters: fallback, reason: 'unknown' })
    vi.useFakeTimers()
    const hanging: NarrativeJsonClient = { complete: vi.fn(() => new Promise<never>(() => {})) }
    const pending = writeAiLockedHeadlines(headlineBriefs, fallback, hanging)
    await vi.advanceTimersByTimeAsync(AI_HEADLINE_TIMEOUT_MS)
    expect(await pending).toMatchObject({ mode: 'deterministic', chapters: fallback, reason: 'provider_timeout' })
    expect(hanging.complete).toHaveBeenCalledTimes(1)
  })

  it('keeps distinct safe codes for global response and provider failures', async () => {
    const { fallback, headlineBriefs } = fixture()
    const cases = [
      ['', 'empty_output'],
      ['[]', 'invalid_top_level_schema'],
      [{ wrong: [] }, 'missing_chapters_array'],
      [{ chapters: [] }, 'missing_all_chapters'],
    ] as const
    for (const [answer, reason] of cases) {
      const result = await writeAiLockedHeadlines(headlineBriefs, fallback, client(answer))
      expect(result).toMatchObject({ mode: 'deterministic', reason, chapters: fallback })
    }
    const rejected = response(headlineBriefs)
    rejected.chapters.forEach((chapter) => { chapter.sourceRefs = ['outside-brief'] })
    expect(await writeAiLockedHeadlines(headlineBriefs, fallback, client(rejected))).toMatchObject({
      reason: 'all_chapters_rejected', rejectedChapters: Array.from({ length: 12 }, (_, index) => index + 1),
    })
    const provider: NarrativeJsonClient = { complete: vi.fn().mockRejectedValue(
      new AiTransportFailure('provider_http_error', 400)) }
    expect(await writeAiLockedHeadlines(headlineBriefs, fallback, provider)).toMatchObject({
      mode: 'deterministic', reason: 'provider_http_error', httpStatus: 400, chapters: fallback,
    })
  })

  it('keeps deterministic output and three existing diagnostic comparisons reproducible', async () => {
    const comparison = []
    for (const sample of samples) {
      const { fallback, headlineBriefs } = fixture(sample)
      const mock = client(response(headlineBriefs))
      const result = await writeAiLockedHeadlines(headlineBriefs, fallback, mock)
      const again = await writeAiLockedHeadlines(headlineBriefs, fallback, client(response(headlineBriefs)))
      expect(result).toEqual(again)
      comparison.push({ input: sample.birthDate, titles: fallback.map((chapter, index) => ({
        chapter: chapter.chapter, deterministic: chapter.title, mockAi: result.chapters[index].title,
      })) })
    }
    expect(comparison).toHaveLength(3)
    expect(comparison.every((sample) => sample.titles.length === 12
      && sample.titles.some((chapter) => chapter.deterministic !== chapter.mockAi))).toBe(true)
    expect(comparison).toMatchSnapshot()
  })

  it('leaves the free result route disconnected from the AI headline transport', () => {
    const page = readFileSync(new URL('../../../pages/result/[id].astro', import.meta.url), 'utf8')
    const service = readFileSync(new URL('../server/result-page.ts', import.meta.url), 'utf8')
    expect(page + service).not.toMatch(/ai-headline-writer|writeAiLockedHeadlines|openAiNarrativeClient|OPENAI_API_KEY/)
  })
})
