export const PROVIDER_TIMEOUT_REASON = 'provider_timeout' as const

export type AiTransportFailureCode = 'missing_api_key' | 'provider_http_error' | 'provider_network' | 'provider_timeout'
  | 'response_parse_error' | 'provider_response_schema_error' | 'empty_output'

export interface SafeProviderError {
  readonly type?: string
  readonly code?: string
  readonly param?: string
}

/** Safe diagnostic metadata only. Never attach a provider body or prompt. */
export class AiTransportFailure extends Error {
  constructor(readonly code: AiTransportFailureCode, readonly httpStatus?: number,
    readonly providerError?: SafeProviderError) {
    super(code)
    this.name = 'AiTransportFailure'
  }
}
