import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as cancel from '../../../pages/api/payments/kakaopay/cancel'
import * as fail from '../../../pages/api/payments/kakaopay/fail'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network calls are forbidden') }))
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {})
  }
})

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled()
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    expect(console[method]).not.toHaveBeenCalled()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const routes = [
  { name: 'cancel', route: cancel, body: { received: true, cancelled: true } },
  { name: 'fail', route: fail, body: { received: true, failed: true } },
]

describe.each(routes)('$name callback', ({ name, route, body }) => {
  function call(method = 'GET', tokenPresent = false) {
    const url = new URL(`https://saju.example/api/payments/kakaopay/${name}`)
    // Simulate presence without generating a token or sending any HTTP request.
    vi.spyOn(url.searchParams, 'has').mockImplementation((key) => key === 'pg_token' && tokenPresent)
    vi.spyOn(url.searchParams, 'get').mockImplementation(() => { throw new Error('Token reads are forbidden') })
    const response = route.ALL({ request: new Request(url, { method }), url })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect([...response.headers.keys()].some((key) => key.startsWith('access-control-'))).toBe(false)
    expect(url.searchParams.get).not.toHaveBeenCalled()
    return response
  }

  it('is dynamic and returns only the safe GET payload without logging', async () => {
    expect(route.prerender).toBe(false)
    const response = call('GET', true)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(body)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('rejects %s', async (method) => {
    const response = call(method, true)
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
    expect(await response.json()).toEqual({ message: 'Method not allowed' })
  })

  it('handles GET without pg_token', async () => {
    const response = call()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(body)
  })
})
