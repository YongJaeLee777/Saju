import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL, GET } from '../../pages/api/dev/outbound'

// The diagnostic route deliberately reads no request context or bindings.
const call = () => Reflect.apply(GET, undefined, []) as Promise<Response>
const otherMethod = () => Reflect.apply(ALL, undefined, []) as Response
let network: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('PROD', false)
  network = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', network)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('DEV outbound diagnostic (mock only)', () => {
  it('makes one credential-free HEAD per fixed target and treats 404 as connectivity success', async () => {
    network.mockResolvedValueOnce(new Response(null, { status: 404 }))
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      kakao: { fetchSucceeded: true, httpStatus: 404 },
      comparison: { fetchSucceeded: true, httpStatus: 200 },
    })
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      'https://open-api.kakaopay.com/', 'https://example.com/',
    ])
    for (const [, options] of network.mock.calls) {
      expect(options).toEqual({ method: 'HEAD', redirect: 'manual', credentials: 'omit', signal: expect.any(AbortSignal) })
    }
  })

  it.each(['AbortError', 'TypeError', 'SyntaxError', 'Error', 'private-name'])(
    'allows only safe error names and isolates Kakao failure: %s', async (name) => {
      network.mockRejectedValueOnce({ name, message: 'private-message', cause: 'private-cause', stack: 'private-stack' })
      const result = await (await call()).json()
      expect(result).toEqual({
        kakao: { fetchSucceeded: false, httpStatus: null, errorName: name === 'private-name' ? 'Unknown' : name },
        comparison: { fetchSucceeded: true, httpStatus: 200 },
      })
      expect(network).toHaveBeenCalledTimes(2)
    },
  )

  it('reports both failures without retrying or reading exception text', async () => {
    const error = { name: 'TypeError', get message() { throw new Error('must not read') },
      get cause() { throw new Error('must not read') }, get stack() { throw new Error('must not read') } }
    network.mockRejectedValue(error)
    expect(await (await call()).json()).toEqual({
      kakao: { fetchSucceeded: false, httpStatus: null, errorName: 'TypeError' },
      comparison: { fetchSucceeded: false, httpStatus: null, errorName: 'TypeError' },
    })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it.each([[false, true], [false, false], [true, true]])('disables all methods with DEV=%s PROD=%s', async (dev, prod) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('PROD', prod)
    expect((await call()).status).toBe(404)
    expect(otherMethod().status).toBe(404)
    expect(network).not.toHaveBeenCalled()
  })

  it('rejects other methods without outbound requests', () => {
    expect(otherMethod().status).toBe(405)
    expect(network).not.toHaveBeenCalled()
  })

  it('does not follow redirects', async () => {
    network.mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://unused.example/' } }))
    const result = await (await call()).json()
    expect(result).toMatchObject({ kakao: { fetchSucceeded: true, httpStatus: 302 } })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('aborts stalled requests after ten seconds without retrying', async () => {
    vi.useFakeTimers()
    network.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('private-message', 'AbortError')), { once: true })
    }))
    const pending = call()
    await vi.advanceTimersByTimeAsync(10000)
    expect(await (await pending).json()).toEqual({
      kakao: { fetchSucceeded: false, httpStatus: null, errorName: 'AbortError' },
      comparison: { fetchSucceeded: false, httpStatus: null, errorName: 'AbortError' },
    })
    expect(network).toHaveBeenCalledTimes(2)
  })
})
