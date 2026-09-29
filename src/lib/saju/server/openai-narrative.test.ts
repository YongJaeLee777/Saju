import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openAiNarrativeClient } from './openai-narrative'
import { AI_NARRATIVE_RESPONSE_SCHEMA } from '../narrative/ai-writer'

const bindings = vi.hoisted(() => ({ OPENAI_API_KEY: 'mock-secret' as string | undefined }))
vi.mock('astro:env/server', () => ({}))
vi.mock('cloudflare:workers', () => ({ env: bindings }))
const fetchMock = vi.fn<typeof fetch>()
const request = () => ({ model: 'test-model', instructions: 'editing policy', input: '{"chapters":[]}',
  maxOutputTokens: 100, signal: new AbortController().signal })

beforeEach(() => {
  bindings.OPENAI_API_KEY = 'mock-secret'
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('server-only narrative Responses adapter', () => {
  it('uses one non-storing JSON request and returns only text and token counts', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'completed', error: null,
      usage: { input_tokens: 10, output_tokens: 20 },
      output: [{ type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '{"chapters":[]}' }] }] }))
    expect(await openAiNarrativeClient.complete(request())).toEqual({
      text: '{"chapters":[]}', usage: { inputTokens: 10, outputTokens: 20 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'test-model',
      instructions: 'editing policy', input: '{"chapters":[]}', max_output_tokens: 100,
      store: false, text: { format: { type: 'json_object' } } })
  })

  it('uses the Responses strict schema shape for a headline request', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'completed', error: null,
      output: [{ type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '{"chapters":[]}' }] }] }))
    const schema = { type: 'object', properties: { chapters: { type: 'array',
      items: { type: 'string' } } }, required: ['chapters'], additionalProperties: false }
    await openAiNarrativeClient.complete({ ...request(), jsonSchema: { name: 'headlines_v1', schema } })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({ model: 'test-model', instructions: 'editing policy',
      input: '{"chapters":[]}', max_output_tokens: 100, store: false,
      text: { format: { type: 'json_schema', name: 'headlines_v1', schema, strict: true } } })
    expect(body).not.toHaveProperty('response_format')
    expect(body).not.toHaveProperty('reasoning')
  })

  it('sends the production narrative schema through Responses text.format', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'completed', error: null,
      output: [{ type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '{"chapters":[]}' }] }] }))
    await openAiNarrativeClient.complete({ ...request(), jsonSchema: AI_NARRATIVE_RESPONSE_SCHEMA })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({ model: 'test-model', instructions: 'editing policy',
      input: '{"chapters":[]}', max_output_tokens: 100, store: false,
      text: { format: { type: 'json_schema', name: 'saju_narrative_v2',
        schema: AI_NARRATIVE_RESPONSE_SCHEMA.schema, strict: true } } })
    expect(body).not.toHaveProperty('response_format')
    expect(body).not.toHaveProperty('reasoning')
  })

  it('fails closed without a key or on provider errors, with no retry', async () => {
    bindings.OPENAI_API_KEY = undefined
    await expect(openAiNarrativeClient.complete(request())).rejects.toMatchObject({ code: 'missing_api_key' })
    expect(fetchMock).not.toHaveBeenCalled()
    bindings.OPENAI_API_KEY = 'mock-secret'
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    await expect(openAiNarrativeClient.complete(request())).rejects.toMatchObject({
      code: 'provider_http_error', httpStatus: 503,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('extracts only safe provider error type/code/param on HTTP 400', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { type: 'invalid_request_error',
      code: 'invalid_json_schema', param: 'text.format.schema',
      message: 'private provider response body', extra: 'private' } }, { status: 400 }))
    const failure = await openAiNarrativeClient.complete(request()).catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'provider_http_error', httpStatus: 400,
      providerError: { type: 'invalid_request_error', code: 'invalid_json_schema',
        param: 'text.format.schema' } })
    expect(JSON.stringify(failure)).not.toMatch(/private|message|extra/)
    fetchMock.mockResolvedValueOnce(Response.json({ error: { type: 'invalid_request_error',
      code: 'bad code with spaces', param: 'text.format;secret' } }, { status: 400 }))
    const unsafe = await openAiNarrativeClient.complete(request()).catch((error: unknown) => error)
    expect(unsafe).toMatchObject({ providerError: { type: 'invalid_request_error' } })
  })

  it('classifies transport and envelope failures without exposing response contents', async () => {
    fetchMock.mockRejectedValueOnce(new Error('private network details'))
    await expect(openAiNarrativeClient.complete(request())).rejects.toMatchObject({ code: 'provider_network' })
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }))
    await expect(openAiNarrativeClient.complete(request())).rejects.toMatchObject({ code: 'response_parse_error' })
    fetchMock.mockResolvedValueOnce(Response.json({ status: 'incomplete', output: [] }))
    await expect(openAiNarrativeClient.complete(request())).rejects.toMatchObject({
      code: 'provider_response_schema_error',
    })
    fetchMock.mockResolvedValueOnce(Response.json({ status: 'completed', output: [] }))
    await expect(openAiNarrativeClient.complete(request())).rejects.toMatchObject({ code: 'empty_output' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('classifies its timed abort separately from a network failure without retrying', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      fetchMock.mockImplementationOnce((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('simulated fetch abort')))
      }))
      const pending = openAiNarrativeClient.complete({ ...request(), signal: controller.signal })
      const failure = expect(pending).rejects.toMatchObject({ code: 'provider_timeout' })
      setTimeout(() => controller.abort('provider_timeout'), 20)
      await vi.advanceTimersByTimeAsync(20)
      await failure
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
