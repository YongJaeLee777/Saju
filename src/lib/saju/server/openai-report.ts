// Astro rejects this import from client bundles.
import 'astro:env/server'
import { env } from 'cloudflare:workers'
import type { DeterministicReport } from '../types'
import { buildLlmReportPrompt, validateLlmReportResponse } from '../analyzer/llm-report'

export const OPENAI_REPORT_TIMEOUT_MS = 15000
export const OPENAI_REPORT_MAX_OUTPUT_TOKENS = 4096

interface ReportUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}
interface OpenAiReportDebug {
  readonly httpStatus: number
  readonly error: {
    readonly type: string | null
    readonly code: string | null
    readonly param: string | null
    readonly message: string
  }
}
export type OpenAiReportResult = {
  readonly report: DeterministicReport
  readonly usage: ReportUsage | null
  readonly debug?: OpenAiReportDebug
} & (
  | { readonly mode: 'llm'; readonly semanticGuarantee: false }
  | { readonly mode: 'deterministic'; readonly reason: 'missing-key' | 'empty-report' | 'timeout' | 'request-error' | 'invalid-response' }
)

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Diagnostics are untrusted provider text. Drop extra fields and suppress any
 * field containing secrets, echoed input, headers, JSON or date-like values.
 * This deliberately favors redaction over complete provider error messages.
 */
function errorDebug(value: unknown, httpStatus: number, key: string, input: DeterministicReport): OpenAiReportDebug | undefined {
  if (!record(value) || !record(value.error)) return undefined
  const error = value.error
  if (typeof error.message !== 'string'
    || ![error.type, error.code, error.param].every((field) => field == null || typeof field === 'string')) return undefined
  const sensitive = new Set<string>([key])
  const collect = (item: unknown): void => {
    if (typeof item === 'string' && item.length > 0) sensitive.add(item)
    else if (Array.isArray(item)) item.forEach(collect)
    else if (record(item)) Object.values(item).forEach(collect)
  }
  collect(input)
  const sanitize = (text: string): string => {
    if ([...sensitive].some((secret) => text.includes(secret))
      || /authorization|bearer|headers?|api[_ -]?key|sk-[\w*-]+|[{}]|birth|natal|evidence|생년|원국|\d{4}[-/.년]\s*\d{1,2}/i.test(text)) return '[redacted]'
    return text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').slice(0, 2000)
  }
  const nullable = (field: unknown): string | null => typeof field === 'string' ? sanitize(field) : null
  return { httpStatus, error: { type: nullable(error.type), code: nullable(error.code), param: nullable(error.param), message: sanitize(error.message) } }
}

function readUsage(value: unknown): ReportUsage | null {
  if (!record(value) || typeof value.input_tokens !== 'number' || typeof value.output_tokens !== 'number'
    || !Number.isSafeInteger(value.input_tokens) || !Number.isSafeInteger(value.output_tokens)
    || value.input_tokens < 0 || value.output_tokens < 0) return null
  return { inputTokens: value.input_tokens, outputTokens: value.output_tokens }
}

function responseText(value: Record<string, unknown>): string | null {
  if (value.status !== 'completed' || value.error != null || !Array.isArray(value.output)) return null
  const parts: string[] = []
  for (const item of value.output) {
    if (!record(item)) return null
    if (item.type === 'reasoning') continue
    if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed'
      || !Array.isArray(item.content)) return null
    for (const content of item.content) {
      if (!record(content) || content.type !== 'output_text' || typeof content.text !== 'string') return null
      parts.push(content.text)
    }
  }
  return parts.length > 0 ? parts.join('') : null
}

/** One request, no retries. Call only behind future entitlement/rate-limit checks.
 * Timeout bounds both fetch and body reading; abort cannot guarantee zero provider billing.
 * Only allowlisted, sanitized error diagnostics are returned; nothing is logged.
 */
export async function renderOpenAiReport(input: DeterministicReport): Promise<OpenAiReportResult> {
  let usage: ReportUsage | null = null
  const fallback = (reason: 'missing-key' | 'empty-report' | 'timeout' | 'request-error' | 'invalid-response'): OpenAiReportResult => ({
    report: structuredClone(input), usage, mode: 'deterministic', reason,
  })
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const key = env.OPENAI_API_KEY?.trim()
    if (!key) return fallback('missing-key')
    if (input.sections.length === 0) return fallback('empty-report')
    const prompt = buildLlmReportPrompt(input)
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('timeout'))
      }, OPENAI_REPORT_TIMEOUT_MS)
    })
    const request = async (): Promise<OpenAiReportResult> => {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.6-luna', instructions: prompt.system, input: prompt.user,
          max_output_tokens: OPENAI_REPORT_MAX_OUTPUT_TOKENS,
          store: false, text: { format: { type: 'json_object' } },
        }),
      })
      if (!response.ok) {
        const result = fallback('request-error')
        try {
          const debug = errorDebug(await response.json(), response.status, key, input)
          return debug ? { ...result, debug } : result
        } catch { return result }
      }
      let payload: unknown
      try { payload = await response.json() } catch { return fallback('invalid-response') }
      if (!record(payload)) return fallback('invalid-response')
      usage = readUsage(payload.usage)
      const text = responseText(payload)
      if (text === null) return fallback('invalid-response')
      const validated = validateLlmReportResponse(input, text)
      if (!validated.valid) return fallback('invalid-response')
      return { report: validated.report, usage, mode: 'llm', semanticGuarantee: false }
    }
    return await Promise.race([request(), timeout])
  } catch {
    return fallback(controller.signal.aborted ? 'timeout' : 'request-error')
  } finally {
    clearTimeout(timer)
  }
}
