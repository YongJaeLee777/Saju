export const PROVIDER_TIMEOUT_REASON = 'provider_timeout' as const

export type AiTransportFailureCode = 'missing_api_key' | 'provider_http_error' | 'provider_network' | 'provider_timeout'
  | 'request_build_error' | 'response_parse_error' | 'provider_response_schema_error' | 'empty_output'
export type AiTransportStage = 'serialize' | 'headers' | 'request_build' | 'fetch'

export interface SafeProviderError {
  readonly type?: string
  readonly code?: string
  readonly param?: string
}

/** Fixed request metadata and allowlisted error names only; never an error message or URL query. */
export interface SafeNetworkDiagnostic {
  readonly errorName: string
  readonly causeName?: string
  readonly isAbortError: boolean
  readonly timeoutTriggered: boolean
  readonly apiKeyPresent: boolean
  readonly targetHost: 'api.openai.com'
  readonly targetPath: '/v1/responses'
  readonly method: 'POST'
}

/** Safe diagnostic metadata only. Never attach a provider body or prompt. */
export class AiTransportFailure extends Error {
  constructor(readonly code: AiTransportFailureCode, readonly httpStatus?: number,
    readonly providerError?: SafeProviderError, readonly networkDiagnostic?: SafeNetworkDiagnostic,
    readonly stage?: AiTransportStage) {
    super(code)
    this.name = 'AiTransportFailure'
  }
}
