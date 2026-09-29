import type { NarrativeJsonClient } from '../narrative/ai-writer'
import { AiTransportFailure, PROVIDER_TIMEOUT_REASON } from '../narrative/ai-failure'
import type { SafeNetworkDiagnostic, SafeProviderError } from '../narrative/ai-failure'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const OPENAI_METHOD = 'POST'
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'AbortError', 'NetworkError', 'FetchError',
  'DOMException', 'TimeoutError', 'SecurityError', 'NotAllowedError', 'InvalidStateError',
  'SyntaxError', 'RangeError'])

function safeErrorName(value: unknown): string | undefined {
  if (!record(value)) return undefined
  try { return typeof value.name === 'string' && SAFE_ERROR_NAMES.has(value.name) ? value.name : undefined }
  catch { return undefined }
}

function safeNetworkDiagnostic(error: unknown, timeoutTriggered: boolean): SafeNetworkDiagnostic {
  const errorName = safeErrorName(error) ?? 'UnknownError'
  let causeName: string | undefined
  try { causeName = record(error) ? safeErrorName(error.cause) : undefined } catch { /* No raw error details. */ }
  return { errorName, ...(causeName ? { causeName } : {}),
    isAbortError: errorName === 'AbortError' || causeName === 'AbortError',
    timeoutTriggered, apiKeyPresent: true, targetHost: 'api.openai.com',
    targetPath: '/v1/responses', method: OPENAI_METHOD }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeErrorToken(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 120 && /^[A-Za-z0-9_.\[\]-]+$/.test(value)
    ? value : undefined
}

async function readSafeProviderError(response: Response): Promise<SafeProviderError | undefined> {
  try {
    const body: unknown = await response.json()
    if (!record(body) || !record(body.error)) return undefined
    const type = safeErrorToken(body.error.type)
    const code = safeErrorToken(body.error.code)
    const param = safeErrorToken(body.error.param)
    return type || code || param ? { ...(type ? { type } : {}), ...(code ? { code } : {}),
      ...(param ? { param } : {}) } : undefined
  } catch { return undefined }
}

/** Shared Responses JSON transport; callers own where the secret comes from. */
export function createOpenAiJsonClient(getKey: () => string | undefined): NarrativeJsonClient {
  return {
    async complete({ model, instructions, input, maxOutputTokens, signal, jsonSchema }) {
      const key = getKey()?.trim()
      if (!key) throw new AiTransportFailure('missing_api_key')
      let body: string
      try {
        body = JSON.stringify({ model, instructions, input, max_output_tokens: maxOutputTokens,
          store: false, text: { format: jsonSchema
            ? { type: 'json_schema', name: jsonSchema.name, schema: jsonSchema.schema, strict: true }
            : { type: 'json_object' } } })
      } catch (error) {
        throw new AiTransportFailure('request_build_error', undefined, undefined,
          safeNetworkDiagnostic(error, false), 'serialize')
      }
      let headers: Headers
      try {
        headers = new Headers({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' })
      } catch (error) {
        throw new AiTransportFailure('request_build_error', undefined, undefined,
          safeNetworkDiagnostic(error, false), 'headers')
      }
      let request: Request
      try {
        request = new Request(OPENAI_RESPONSES_URL, {
          method: OPENAI_METHOD, redirect: 'manual', signal, headers, body,
        })
      } catch (error) {
        throw new AiTransportFailure('request_build_error', undefined, undefined,
          safeNetworkDiagnostic(error, false), 'request_build')
      }
      let response: Response
      try {
        response = await fetch(request)
      } catch (error) {
        const timeoutTriggered = signal.aborted && signal.reason === PROVIDER_TIMEOUT_REASON
        throw new AiTransportFailure(timeoutTriggered ? 'provider_timeout' : 'provider_network',
          undefined, undefined, timeoutTriggered ? undefined : safeNetworkDiagnostic(error, false), 'fetch')
      }
      if (!response.ok) throw new AiTransportFailure('provider_http_error', response.status,
        await readSafeProviderError(response))
      let payload: unknown
      try { payload = await response.json() }
      catch { throw new AiTransportFailure('response_parse_error') }
      if (!record(payload) || payload.status !== 'completed' || payload.error != null || !Array.isArray(payload.output)) {
        throw new AiTransportFailure('provider_response_schema_error')
      }
      const parts: string[] = []
      for (const item of payload.output) {
        if (!record(item)) throw new AiTransportFailure('provider_response_schema_error')
        if (item.type === 'reasoning') continue
        if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed'
          || !Array.isArray(item.content)) throw new AiTransportFailure('provider_response_schema_error')
        for (const content of item.content) {
          if (!record(content) || content.type !== 'output_text' || typeof content.text !== 'string') {
            throw new AiTransportFailure('provider_response_schema_error')
          }
          parts.push(content.text)
        }
      }
      if (parts.length === 0 || !parts.join('').trim()) throw new AiTransportFailure('empty_output')
      const usage = record(payload.usage) && typeof payload.usage.input_tokens === 'number'
        && typeof payload.usage.output_tokens === 'number'
        ? { inputTokens: payload.usage.input_tokens, outputTokens: payload.usage.output_tokens } : null
      return { text: parts.join(''), usage }
    },
  }
}
