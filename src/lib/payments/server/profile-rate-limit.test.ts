import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { POST as profilePost } from '../../../pages/api/saju/profile'
import { POST as readyPost } from '../../../pages/api/payments/kakaopay/ready'
import { readyKakaoPayReport } from './kakaopay-ready'
import { prepareAnonymousBuyerRateLimit } from './report-access'
import { createDb } from '../../../db/client'

const { profileLimit, readyLimit, insertValues } = vi.hoisted(() => ({
  profileLimit: vi.fn(), readyLimit: vi.fn(), insertValues: vi.fn(),
}))
vi.mock('cloudflare:workers', () => ({ env: {
  saju_db: {}, PROFILE_RATE_LIMIT: { limit: profileLimit }, READY_RATE_LIMIT: { limit: readyLimit },
} }))
vi.mock('../../../db/client', () => ({ createDb: vi.fn(() => ({
  insert: () => ({ values: insertValues }),
})) }))
vi.mock('./report-access', () => ({ prepareAnonymousBuyerRateLimit: vi.fn() }))
vi.mock('./kakaopay-ready', () => ({ readyKakaoPayReport: vi.fn() }))

const cookies = { get: vi.fn(), set: vi.fn() }
const profileId = 'de305d54-75b4-431b-adb2-eb6b9e546014'
const profileRequest = () => new Request('https://saju.example/api/saju/profile', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ birthDate: '1991-01-02', gender: 'female', calendarType: 'solar' }),
})
const readyRequest = () => new Request('https://saju.example/api/payments/kakaopay/ready', {
  method: 'POST', headers: { Origin: 'https://saju.example', 'Content-Type': 'application/json' },
  body: JSON.stringify({ profileId }),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prepareAnonymousBuyerRateLimit).mockResolvedValue({ key: 'a'.repeat(64) })
  vi.mocked(readyKakaoPayReport).mockResolvedValue({ ok: true,
    redirectUrl: 'https://online-pay.kakaopay.com/mock-pc', cacheControl: 'private, no-store' })
  insertValues.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real Kakao calls are forbidden') }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('anonymous buyer rate limits', () => {
  it('does not issue a first-visit buyer cookie or touch D1 when blocked', async () => {
    const issueBuyer = vi.fn()
    vi.mocked(prepareAnonymousBuyerRateLimit).mockResolvedValue({ key: 'a'.repeat(64), issueBuyer })
    profileLimit.mockResolvedValue({ success: false })
    readyLimit.mockResolvedValue({ success: false })

    expect((await profilePost({ request: profileRequest(), cookies })).status).toBe(429)
    expect((await readyPost({ request: readyRequest(), cookies })).status).toBe(429)
    expect(issueBuyer).not.toHaveBeenCalled()
    expect(createDb).not.toHaveBeenCalled()
    expect(readyKakaoPayReport).not.toHaveBeenCalled()
  })

  it('allows 6 profile and 3 ready requests independently, then blocks before DB or Kakao work', async () => {
    let profileCount = 0
    let readyCount = 0
    profileLimit.mockImplementation(async () => ({ success: ++profileCount <= 6 }))
    readyLimit.mockImplementation(async () => ({ success: ++readyCount <= 3 }))

    for (let i = 0; i < 6; i++) {
      expect((await profilePost({ request: profileRequest(), cookies })).status).toBe(200)
    }
    expect(insertValues).toHaveBeenCalledTimes(6)
    const profileBlocked = await profilePost({ request: profileRequest(), cookies })
    expect(profileBlocked.status).toBe(429)
    expect(profileBlocked.headers.get('Cache-Control')).toBe('private, no-store')
    expect(insertValues).toHaveBeenCalledTimes(6)
    expect(createDb).toHaveBeenCalledTimes(6)

    for (let i = 0; i < 3; i++) {
      expect((await readyPost({ request: readyRequest(), cookies })).status).toBe(200)
    }
    expect(readyKakaoPayReport).toHaveBeenCalledTimes(3)
    const readyBlocked = await readyPost({ request: readyRequest(), cookies })
    expect(readyBlocked.status).toBe(429)
    expect(readyBlocked.headers.get('Cache-Control')).toBe('private, no-store')
    expect(readyKakaoPayReport).toHaveBeenCalledTimes(3)
    expect(createDb).toHaveBeenCalledTimes(9)
    expect(fetch).not.toHaveBeenCalled()
    expect(profileLimit).toHaveBeenCalledWith({ key: 'a'.repeat(64) })
    expect(readyLimit).toHaveBeenCalledWith({ key: 'a'.repeat(64) })
  })
})
