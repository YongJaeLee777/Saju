import type { NarrativeJsonClient } from '../narrative/ai-writer'
import { AiTransportFailure, PROVIDER_TIMEOUT_REASON } from '../narrative/ai-failure'
import type { SafeProviderError } from '../narrative/ai-failure'

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
      let response: Response
      try {
        response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST', redirect: 'error', signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, instructions, input, max_output_tokens: maxOutputTokens,
            store: false, text: { format: jsonSchema
              ? { type: 'json_schema', name: jsonSchema.name, schema: jsonSchema.schema, strict: true }
              : { type: 'json_object' } } }),
        })
      } catch {
        throw new AiTransportFailure(signal.aborted && signal.reason === PROVIDER_TIMEOUT_REASON
          ? 'provider_timeout' : 'provider_network')
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
