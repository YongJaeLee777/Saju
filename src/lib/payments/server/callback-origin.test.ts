import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCallbackOrigin } from './callback-origin'

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('PROD', false)
})
afterEach(() => { vi.unstubAllEnvs() })

describe('callback origin configuration', () => {
  it.each(['http://localhost:4321', 'http://127.0.0.1:4321', 'http://127.0.0.1:8080'])(
    'allows local HTTP in development with test payments: %s', (origin) => {
      expect(parseCallbackOrigin(origin, 'test')).toBe(origin)
    },
  )

  it.each(['http://example.com', 'http://localhost.example.com', 'http://127.0.0.2'])(
    'rejects non-allowlisted HTTP hosts: %s', (origin) => {
      expect(parseCallbackOrigin(origin, 'test')).toBeNull()
    },
  )

  it.each(['http://localhost:4321', 'http://127.0.0.1:8080'])(
    'rejects local HTTP with live payments: %s', (origin) => {
      expect(parseCallbackOrigin(origin, 'live')).toBeNull()
    },
  )

  it.each(['http://localhost:4321', 'http://127.0.0.1:8080'])(
    'rejects local HTTP in production even with test payments: %s', (origin) => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('PROD', true)
      expect(parseCallbackOrigin(origin, 'test')).toBeNull()
    },
  )

  it.each(['test', 'live'] as const)('preserves HTTPS support for %s in production', (environment) => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('PROD', true)
    expect(parseCallbackOrigin('https://saju.example/', environment)).toBe('https://saju.example')
  })

  it.each([undefined, '', 'not-a-url', 'ftp://localhost', 'http://user:pass@localhost:4321',
    'http://localhost:4321/callback', 'http://localhost:4321/?a=1', 'http://localhost:4321/#fragment',
    'https://user:pass@saju.example', 'https://saju.example/callback',
    'https://saju.example/?a=1', 'https://saju.example/#fragment'])(
    'preserves origin format validation: %s', (origin) => {
      expect(parseCallbackOrigin(origin, 'test')).toBeNull()
    },
  )
})
