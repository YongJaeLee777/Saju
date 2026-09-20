import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../../../pages/api/payments/kakaopay/ready'
import { readyKakaoPayReport } from './kakaopay-ready'
import { createDb } from '../../../db/client'

vi.mock('cloudflare:workers', () => ({ env: { saju_db: {} } }))
vi.mock('../../../db/client', () => ({ createDb: vi.fn(() => ({ mockedDb: true })) }))
vi.mock('./kakaopay-ready', () => ({ readyKakaoPayReport: vi.fn() }))

const profileId = 'de305d54-75b4-431b-adb2-eb6b9e546014'
const cookies = { get: vi.fn(), set: vi.fn() }
function request(body: unknown = { profileId }, overrides: Record<string, string> = {}) {
  return new Request('https://saju.example/api/payments/kakaopay/ready', {
    method: 'POST', headers: { Origin: 'https://saju.example', 'Content-Type': 'application/json', ...overrides },
    body: JSON.stringify(body),
  })
}
async function call(req = request()) {
  const response = await POST({ request: req, cookies })
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  return response
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readyKakaoPayReport).mockResolvedValue({ ok: true,
    redirectUrl: 'https://online-pay.kakaopay.com/redirect', cacheControl: 'private, no-store' })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network calls are forbidden in this test') }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('POST /api/payments/kakaopay/ready', () => {
  it.each([true, false])('never exposes internal diagnostics in HTTP responses (DEV=%s)', async (dev) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('PROD', !dev)
    vi.mocked(readyKakaoPayReport).mockResolvedValue({ ok: false, code: 'provider-network',
      cacheControl: 'private, no-store', debug: { stage: 'fetch', errorName: 'TypeError', category: 'connection' } })
    const response = await call()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ message: '요청을 처리할 수 없습니다.' })
  })

  it('passes the cookie adapter and fixed year, returning only the redirect URL', async () => {
    const response = await call(request({ profileId }, { 'Sec-Fetch-Site': 'same-origin' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ redirectUrl: 'https://online-pay.kakaopay.com/redirect' })
    expect(readyKakaoPayReport).toHaveBeenCalledWith({ db: { mockedDb: true }, cookies, profileId, reportYear: 2026 })
    expect(readyKakaoPayReport).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([{}, null, [], { profileId: 123 }, { profileId: '' }, { profileId: 'not-uuid' },
    { profileId: `${profileId} ` }, { profileId, amount: 1 }, { profileId, itemName: 'custom' },
    { profileId, cid: 'live' }, { profileId, reportYear: 2027 }, { profileId, buyerId: 'someone' },
  ])('rejects invalid or extra client input %#', async (body) => {
    expect((await call(request(body))).status).toBe(400)
    expect(readyKakaoPayReport).not.toHaveBeenCalled()
    expect(createDb).not.toHaveBeenCalled()
  })

  it.each(['https://evil.example', 'https://sub.saju.example', 'http://saju.example', 'null', ''])
    ('rejects a mismatching Origin (%s)', async (origin) => {
      expect((await call(request({ profileId }, { Origin: origin }))).status).toBe(403)
      expect(readyKakaoPayReport).not.toHaveBeenCalled()
    })

  it('rejects missing Origin even with a same-origin Referer', async () => {
    const req = request()
    req.headers.delete('Origin')
    req.headers.set('Referer', 'https://saju.example/result/id')
    expect((await call(req)).status).toBe(403)
    expect(readyKakaoPayReport).not.toHaveBeenCalled()
  })

  it.each(['cross-site', 'same-site', 'none'])('rejects contradictory Fetch Metadata (%s)', async (site) => {
    expect((await call(request({ profileId }, { 'Sec-Fetch-Site': site }))).status).toBe(403)
    expect(readyKakaoPayReport).not.toHaveBeenCalled()
  })

  it('rejects form/simple request content types', async () => {
    expect((await call(request({ profileId }, { 'Content-Type': 'text/plain' }))).status).toBe(415)
    expect(readyKakaoPayReport).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const req = request()
    expect((await call(new Request(req.url, { method: 'POST', headers: req.headers, body: '{' }))).status).toBe(400)
    expect(readyKakaoPayReport).not.toHaveBeenCalled()
  })

  it.each([
    ['already-entitled', 409], ['purchase-exists', 409], ['provider-http-429', 502],
    ['provider-rejected', 502], ['provider-http-5xx', 502], ['provider-http-other', 502],
    ['provider-network', 502], ['provider-timeout', 502], ['provider-json-invalid', 502],
    ['provider-response-invalid', 502], ['storage-error', 500], ['configuration', 500],
  ] as const)('generalizes %s without disclosing the service error code', async (code, status) => {
    vi.mocked(readyKakaoPayReport).mockResolvedValue({ ok: false, code, cacheControl: 'private, no-store' })
    const response = await call()
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ message: '요청을 처리할 수 없습니다.' })
  })

  it('does not expose or log sensitive exceptions', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.mocked(readyKakaoPayReport).mockRejectedValue(new Error('secret tid orderId private provider error'))
      const response = await call()
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ message: '요청을 처리할 수 없습니다.' })
      expect(log).not.toHaveBeenCalled()
    } finally { log.mockRestore() }
  })
})
