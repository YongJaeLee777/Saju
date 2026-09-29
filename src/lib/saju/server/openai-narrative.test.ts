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
    const [outbound, init] = fetchMock.mock.calls[0]
    expect(init).toBeUndefined()
    if (!(outbound instanceof Request)) throw new Error('Expected a Request instance')
    expect(outbound.url).toBe('https://api.openai.com/v1/responses')
    expect(outbound.method).toBe('POST')
    expect(outbound.redirect).toBe('manual')
    expect(outbound.headers.has('Authorization')).toBe(true)
    expect(outbound.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(await outbound.clone().text())).toMatchObject({ model: 'test-model',
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
    const outbound = fetchMock.mock.calls[0][0]
    if (!(outbound instanceof Request)) throw new Error('Expected a Request instance')
    const body = JSON.parse(await outbound.clone().text())
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
    const outbound = fetchMock.mock.calls[0][0]
    if (!(outbound instanceof Request)) throw new Error('Expected a Request instance')
    const body = JSON.parse(await outbound.clone().text())
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
    fetchMock.mockResolvedValueOnce(new Response('', { status: 302,
      headers: { Location: 'https://example.com/' } }))
    await expect(openAiNarrativeClient.complete(request())).rejects.toMatchObject({
      code: 'provider_http_error', httpStatus: 302,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError('private network details'),
      { cause: new Error('private cause details') }))
    const network = await openAiNarrativeClient.complete(request()).catch((error: unknown) => error)
    expect(network).toMatchObject({ code: 'provider_network', stage: 'fetch', networkDiagnostic: {
      errorName: 'TypeError', causeName: 'Error', isAbortError: false, timeoutTriggered: false,
      apiKeyPresent: true, targetHost: 'api.openai.com', targetPath: '/v1/responses', method: 'POST',
    } })
    expect(JSON.stringify(network)).not.toMatch(/private|Authorization|mock-secret|chapters/)
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
      fetchMock.mockImplementationOnce((outbound) => new Promise<Response>((_resolve, reject) => {
        if (!(outbound instanceof Request)) throw new Error('Expected a Request instance')
        outbound.signal.addEventListener('abort', () => reject(new Error('simulated fetch abort')))
      }))
      const pending = openAiNarrativeClient.complete({ ...request(), signal: controller.signal })
      const failure = expect(pending).rejects.toMatchObject({ code: 'provider_timeout', stage: 'fetch' })
      setTimeout(() => controller.abort('provider_timeout'), 20)
      await vi.advanceTimersByTimeAsync(20)
      await failure
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('separates serialization, header, and Request construction errors before fetch', async () => {
    const serialization = await openAiNarrativeClient.complete({ ...request(),
      jsonSchema: { name: 'test', schema: { invalid: BigInt(1) } },
    }).catch((error: unknown) => error)
    expect(serialization).toMatchObject({ code: 'request_build_error', stage: 'serialize',
      networkDiagnostic: { errorName: 'TypeError' } })
    expect(fetchMock).not.toHaveBeenCalled()

    const NativeHeaders = globalThis.Headers
    vi.stubGlobal('Headers', class { constructor() { throw new TypeError('private header detail') } })
    const headers = await openAiNarrativeClient.complete(request()).catch((error: unknown) => error)
    expect(headers).toMatchObject({ code: 'request_build_error', stage: 'headers',
      networkDiagnostic: { errorName: 'TypeError' } })
    expect(fetchMock).not.toHaveBeenCalled()

    vi.stubGlobal('Headers', NativeHeaders)
    vi.stubGlobal('Request', class { constructor() { throw new TypeError('private request detail') } })
    const requestBuild = await openAiNarrativeClient.complete(request()).catch((error: unknown) => error)
    expect(requestBuild).toMatchObject({ code: 'request_build_error', stage: 'request_build',
      networkDiagnostic: { errorName: 'TypeError' } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(requestBuild)).not.toMatch(/private|mock-secret|Authorization/)
  })
})
