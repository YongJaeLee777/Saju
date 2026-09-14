import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeterministicReport } from '../types'
import { buildLlmReportPrompt } from '../analyzer/llm-report'
import { renderOpenAiReport, OPENAI_REPORT_TIMEOUT_MS } from './openai-report'

const bindings = vi.hoisted(() => ({ OPENAI_API_KEY: 'mock-secret' as string | undefined }))
vi.mock('astro:env/server', () => ({}))
vi.mock('cloudflare:workers', () => ({ env: bindings }))
const fetchMock = vi.fn<typeof fetch>()

function fixture(): DeterministicReport {
  return {
    title: '주제별 요약', intro: '요약을 모았습니다.', closing: '안내를 마칩니다.',
    sections: [{ topic: 'career', headline: '역할과 업무', body: '올해는 역할을 살펴볼 여지가 있어요.', scopeLabel: '올해', methodologyVersion: 'topic-renderer-v1.2' }],
    provenance: [{ topic: 'career', sourceSignalCodes: ['career_change_pressure'], dominantStrength: 'low', dominantPriority: 'low',
      signals: [{ topic: 'career', code: 'career_change_pressure', scope: 'annual', direction: 'mixed', strength: 'low', priority: 'low', methodologyVersion: 'interpretation-v1-alpha.3',
        evidence: [{ kind: 'tenGod', id: 'PRIVATE_EVIDENCE', paths: ['PRIVATE_PATH'], source: { source: 'annual', position: 'stem' }, tenGod: '정관' }] }] }],
    sourceSignalCodes: ['career_change_pressure'], edition: 'free',
    luck: { referenceDate: '2026-09-14', currentDaewoon: null, currentAnnualLuck: null },
    methodologyVersions: { strength: 'v1', interpretation: 'interpretation-v1-alpha.3', topicSummary: 'topic-summary-v1', topicRenderer: 'topic-renderer-v1.2' },
  }
}
function payload(text?: string) {
  const input = fixture()
  return { status: 'completed', usage: { input_tokens: 123, output_tokens: 45 },
    output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: text ?? JSON.stringify({
      title: '주제 요약', intro: input.intro, sections: input.sections.map(({ headline, body }) => ({ headline, body })), closing: input.closing,
    }) }] }] }
}

beforeEach(() => {
  vi.useFakeTimers()
  bindings.OPENAI_API_KEY = 'mock-secret'
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('renderOpenAiReport', () => {
  it('returns only selected non-2xx error diagnostics while preserving fallback', async () => {
    const error = { type: 'invalid_request_error', code: 'unsupported_value', param: 'text.format', message: 'Unsupported value for text.format.' }
    fetchMock.mockResolvedValue(Response.json({ error: { ...error, headers: 'private-header', request: 'private-body' }, extra: 'private' }, { status: 400 }))
    expect(await renderOpenAiReport(fixture())).toEqual({ mode: 'deterministic', reason: 'request-error', usage: null, report: fixture(), debug: { httpStatus: 400, error } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves nullable code and param fields', async () => {
    const error = { type: 'invalid_request_error', code: null, param: null, message: 'Invalid request.' }
    fetchMock.mockResolvedValue(Response.json({ error }, { status: 400 }))
    expect(await renderOpenAiReport(fixture())).toMatchObject({ debug: { httpStatus: 400, error } })
  })

  it('omits diagnostics when error JSON cannot be parsed or has an invalid shape', async () => {
    for (const body of ['{', 'null', '{}', '{"error":[]}', '{"error":{"message":42}}', '{"error":{"message":"Bad request","code":{}}}']) {
      fetchMock.mockResolvedValue(new Response(body, { status: 400 }))
      expect(await renderOpenAiReport(fixture())).toEqual({ mode: 'deterministic', reason: 'request-error', usage: null, report: fixture() })
    }
  })

  it('redacts keys, headers, echoed request data, dates and evidence in every diagnostic field', async () => {
    for (const text of ['mock-secret', 'Authorization: Bearer private', 'sk-proj-partial***', '1991-01-02', 'PRIVATE_EVIDENCE', 'PRIVATE_PATH', JSON.stringify(fixture()), 'PRIVATE_NATAL']) {
      const input = { ...fixture(), natal: 'PRIVATE_NATAL' }
      fetchMock.mockResolvedValue(Response.json({ error: { type: text, code: text, param: text, message: text } }, { status: 400 }))
      const result = await renderOpenAiReport(input)
      expect(result).toMatchObject({ debug: { httpStatus: 400, error: { type: '[redacted]', code: '[redacted]', param: '[redacted]', message: '[redacted]' } } })
      expect(result.report).toEqual(input)
    }
  })

  it('bounds diagnostic text and removes control characters', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: 'Bad\n\u200b' + 'x'.repeat(2100) } }, { status: 400 }))
    const result = await renderOpenAiReport(fixture())
    if (result.mode !== 'deterministic') throw new Error('Expected fallback')
    expect(result.debug?.error.message).toHaveLength(2000)
    expect(result.debug?.error.message).not.toMatch(/[\p{Cc}\p{Cf}]/u)
  })

  it('keeps the timeout while reading non-2xx error JSON', async () => {
    const response = new Response('', { status: 400 })
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}))
    fetchMock.mockResolvedValue(response)
    const pending = renderOpenAiReport(fixture())
    await vi.advanceTimersByTimeAsync(OPENAI_REPORT_TIMEOUT_MS)
    expect(await pending).toEqual({ mode: 'deterministic', reason: 'timeout', usage: null, report: fixture() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('calls Responses exactly once using only projected data and returns validated text and usage', async () => {
    fetchMock.mockResolvedValue(Response.json(payload()))
    const input = { ...fixture(), birthDate: 'PRIVATE_BIRTH', natal: 'PRIVATE_NATAL' }
    const before = structuredClone(input)
    const result = await renderOpenAiReport(input)
    expect(result).toEqual({ mode: 'llm', semanticGuarantee: false, report: { ...input, title: '주제 요약' }, usage: { inputTokens: 123, outputTokens: 45 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer mock-secret' } })
    const prompt = buildLlmReportPrompt(input)
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'gpt-5.6-luna', instructions: prompt.system, input: prompt.user,
      max_output_tokens: 4096, store: false, text: { format: { type: 'json_object' } } })
    expect(String(init?.body)).not.toMatch(/PRIVATE_|mock-secret|evidence/)
    expect(input).toEqual(before)
  })

  it('skips requests for missing keys and empty reports', async () => {
    bindings.OPENAI_API_KEY = undefined
    expect(await renderOpenAiReport(fixture())).toMatchObject({ mode: 'deterministic', reason: 'missing-key', usage: null })
    bindings.OPENAI_API_KEY = 'mock-secret'
    expect(await renderOpenAiReport({ ...fixture(), sections: [] })).toMatchObject({ reason: 'empty-report' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([401, 429, 500])('falls back on HTTP %s without retrying or exposing provider errors', async (status) => {
    fetchMock.mockResolvedValue(new Response('private provider error', { status }))
    expect(await renderOpenAiReport(fixture())).toEqual({ mode: 'deterministic', reason: 'request-error', report: fixture(), usage: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back on network failure without leaking the error or retrying', async () => {
    fetchMock.mockRejectedValue(new Error('mock-secret'))
    expect(await renderOpenAiReport(fixture())).toEqual({ mode: 'deterministic', reason: 'request-error', report: fixture(), usage: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['fetch', 'body'])('times out while waiting for %s, aborts and falls back', async (stage) => {
    if (stage === 'fetch') fetchMock.mockImplementation(() => new Promise(() => {}))
    else {
      const response = new Response()
      vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}))
      fetchMock.mockResolvedValue(response)
    }
    const pending = renderOpenAiReport(fixture())
    await vi.advanceTimersByTimeAsync(OPENAI_REPORT_TIMEOUT_MS)
    expect(await pending).toEqual({ mode: 'deterministic', reason: 'timeout', report: fixture(), usage: null })
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back on invalid transport JSON', async () => {
    fetchMock.mockResolvedValue(new Response('{'))
    expect(await renderOpenAiReport(fixture())).toMatchObject({ mode: 'deterministic', reason: 'invalid-response', report: fixture() })
  })

  it.each(['incomplete', 'failed', 'refusal', 'empty', 'unknown-fields', 'forbidden', 'invalid-json'])('rejects %s responses with full fallback and usage', async (kind) => {
    let data: unknown = payload()
    if (kind === 'incomplete' || kind === 'failed') data = { ...payload(), status: kind }
    if (kind === 'refusal') data = { ...payload(), output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'no' }] }] }
    if (kind === 'empty') data = { ...payload(), output: [] }
    if (kind === 'unknown-fields') data = payload('{"title":"제목","intro":"안내","sections":[],"closing":"끝","extra":1}')
    if (kind === 'forbidden') data = payload(JSON.stringify({ title: '반드시 이직', intro: '안내', sections: [{ headline: '제목', body: '본문' }], closing: '끝' }))
    if (kind === 'invalid-json') data = payload('{')
    fetchMock.mockResolvedValue(Response.json(data))
    expect(await renderOpenAiReport(fixture())).toEqual({ mode: 'deterministic', reason: 'invalid-response', report: fixture(), usage: { inputTokens: 123, outputTokens: 45 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('accepts reasoning followed by text while treating missing usage as unknown', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...payload(), usage: null, output: [{ type: 'reasoning', summary: [] }, ...payload().output] }))
    expect(await renderOpenAiReport(fixture())).toMatchObject({ mode: 'llm', usage: null })
  })
})
