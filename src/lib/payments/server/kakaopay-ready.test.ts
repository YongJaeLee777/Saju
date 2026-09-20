import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createDb } from '../../../db/client'
import { readyKakaoPayReport } from './kakaopay-ready'
import { getOrCreateAnonymousBuyer, findReportEntitlement } from './report-access'
import { buildResultReport } from '../../saju/server/result-page'

const { workerEnv, draft } = vi.hoisted(() => ({
  workerEnv: { KAKAOPAY_SECRET_KEY: 'mock-secret', KAKAOPAY_CALLBACK_ORIGIN: 'https://saju.example' },
  draft: { pillars: [], daewoonNotice: null,
    luck: { referenceDate: '2026-09-19', currentDaewoon: null, currentAnnualLuck: null }, report: {
    title: 'Report', intro: 'Intro', closing: 'Closing',
    sections: [{ topic: 'career', headline: 'Work', body: 'Private report', scopeLabel: 'background', methodologyVersion: 'topic-renderer-v1.2' }],
    provenance: [{ topic: 'career', signals: [], sourceSignalCodes: ['career_change_pressure'], dominantStrength: 'low', dominantPriority: 'low' }],
    sourceSignalCodes: ['career_change_pressure'], methodologyVersions: {
      strength: 'v1', interpretation: 'interpretation-v1-alpha.3', topicSummary: 'topic-summary-v1', topicRenderer: 'topic-renderer-v1.2',
    }, edition: 'free', luck: { referenceDate: '2026-09-19', currentDaewoon: null, currentAnnualLuck: null },
  } } satisfies ReturnType<typeof buildResultReport>,
}))
vi.mock('astro:env/server', () => ({}))
vi.mock('cloudflare:workers', () => ({ env: workerEnv }))
vi.mock('./report-access', () => ({ getOrCreateAnonymousBuyer: vi.fn(), findReportEntitlement: vi.fn() }))
vi.mock('../../saju/server/result-page', () => ({ buildResultReport: vi.fn(() => structuredClone(draft)) }))

let active: boolean
let conflict: boolean
let missingProfile: boolean
let invalidProfile: boolean
let insertFails: boolean
let updateFails: boolean
let noUpdate: boolean
let row: Record<string, unknown> | null
let updates: { query: string; params: unknown[] }[]
let queries: string[]
let network: ReturnType<typeof vi.fn<typeof fetch>>

function database() {
  const prepare = vi.fn<D1Database['prepare']>((query) => {
    queries.push(query)
    let params: unknown[] = []
    const executeRaw = async () => {
        if (query.startsWith('select') && query.includes('saju_profiles')) {
          return missingProfile ? [] : [['1991-01-02', '13:04', invalidProfile ? 'invalid' : 'female', 'solar', 0]]
        }
        if (query.startsWith('select') && query.includes('purchases')) return active ? [['existing']] : []
        if (query.startsWith('insert')) {
          if (insertFails) throw new Error('private SQL error')
          if (conflict || active) return []
          // Decode actual Drizzle INSERT placeholders, including inline NULL/default values.
          const columns = query.match(/\(([^)]+)\) values/)![1]!.split(',').map((s) => s.trim().replaceAll('"', ''))
          const values = query.match(/values \(([^)]+)\)/)![1]!.split(',').map((s) => s.trim())
          let index = 0
          row = Object.fromEntries(columns.map((name, i) => [name, values[i] === '?' ? params[index++] : values[i]]))
          active = true
          return [[row.id]]
        }
        if (query.startsWith('update')) {
          updates.push({ query, params })
          if (updateFails) throw new Error('private SQL error')
          return noUpdate ? [] : [[row?.id]]
        }
        throw new Error('Unexpected mock query')
      }
    async function raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>
    async function raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>
    async function raw(options?: { columnNames?: boolean }): Promise<unknown[]> {
      if (options?.columnNames) throw new Error('Column names are unused by this mock')
      return executeRaw()
    }
    const statement: D1PreparedStatement = {
      bind: (...values) => { params = values; return statement },
      raw,
      run: async () => {
        updates.push({ query, params })
        if (updateFails) throw new Error('private SQL error')
        return { success: true, results: [], meta: { changed_db: true, changes: 1, duration: 0, last_row_id: 0,
          rows_read: 1, rows_written: 1, size_after: 0 } }
      },
      all: async () => { throw new Error('Unexpected all') }, first: async () => { throw new Error('Unexpected first') },
    }
    return statement
  })
  return createDb({ prepare, batch: vi.fn(), exec: vi.fn(), dump: vi.fn(), withSession: vi.fn() })
}

const ctx = () => ({ db: database(), cookies: { get: vi.fn(), set: vi.fn() }, profileId: 'profile', reportYear: 2026 })
const response = () => new Response(JSON.stringify({ tid: 'T-mock',
  next_redirect_pc_url: 'https://online-pay.kakaopay.com/mock-pc',
  next_redirect_mobile_url: 'https://online-pay.kakaopay.com/mock-mobile' }), { status: 200 })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DEV', true)
  vi.stubEnv('PROD', false)
  workerEnv.KAKAOPAY_SECRET_KEY = 'mock-secret'
  workerEnv.KAKAOPAY_CALLBACK_ORIGIN = 'https://saju.example'
  active = conflict = missingProfile = invalidProfile = insertFails = updateFails = noUpdate = false
  row = null; updates = []; queries = []
  vi.mocked(getOrCreateAnonymousBuyer).mockResolvedValue({ id: 'buyer', expiresAt: new Date('2030-01-01') })
  vi.mocked(findReportEntitlement).mockResolvedValue(null)
  vi.mocked(buildResultReport).mockImplementation(() => structuredClone(draft))
  network = vi.fn<typeof fetch>().mockResolvedValue(response())
  vi.stubGlobal('fetch', network)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('test Kakao Pay ready (mock only)', () => {
  describe.each(['fetch', 'response-body'] as const)('DEV diagnostics at %s', (stage) => {
    it.each([
      ['AbortError', undefined, 'aborted', 'AbortError'],
      ['TypeError', 'ECONNRESET', 'connection', 'TypeError'],
      ['Error', 'ERR_TLS_CERT_ALTNAME_INVALID', 'tls', 'Error'],
      ['TypeError', undefined, 'unknown', 'TypeError'],
      ['SyntaxError', undefined, 'unknown', 'SyntaxError'],
      ['private-name', 'private-code', 'unknown', 'Unknown'],
    ] as const)('returns only allowlisted diagnostics for %s / %s', async (name, code, category, errorName) => {
      vi.stubEnv('DEV', true)
      vi.stubEnv('PROD', false)
      // Plain thrown object also verifies arbitrary names and nested data cannot escape.
      const error = { name, message: 'private-message', stack: 'private-stack',
        cause: { code, message: 'private-cause' } }
      if (stage === 'fetch') network.mockRejectedValue(error)
      else {
        const res = response()
        vi.spyOn(res, 'json').mockRejectedValue(error)
        network.mockResolvedValue(res)
      }
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const debugLog = vi.spyOn(console, 'debug').mockImplementation(() => {})
      try {
        const result = await readyKakaoPayReport(ctx())
        expect(result).toEqual({ ok: false, code: 'provider-network', cacheControl: 'private, no-store',
          debug: { stage, errorName, category } })
        expect(updates.at(-1)?.params).toContain(`provider-network-${stage}-${errorName.toLowerCase()}-${category}`)
        expect(updates.at(-1)?.params).not.toContain('provider-network')
        expect(updates.at(-1)?.params).toContain('ready')
        expect(updates.at(-1)?.params).toContain('reconciling')
        expect(JSON.stringify([result, updates])).not.toMatch(/private-message|private-stack|private-cause|private-name|private-code/)
        expect(log).not.toHaveBeenCalled()
        expect(debugLog).not.toHaveBeenCalled()
        expect(network).toHaveBeenCalledTimes(1)
      } finally { log.mockRestore(); debugLog.mockRestore() }
    })
  })

  it.each([[false, true], [false, false], [true, true]])('omits diagnostics with DEV=%s PROD=%s', async (dev, prod) => {
    vi.stubEnv('DEV', dev)
    vi.stubEnv('PROD', prod)
    const error = new TypeError('private-message')
    const readCause = vi.fn(() => { throw new Error('must not inspect production exceptions') })
    Object.defineProperty(error, 'cause', { get: readCause })
    network.mockRejectedValue(error)
    expect(await readyKakaoPayReport(ctx())).toEqual({ ok: false, code: 'provider-network', cacheControl: 'private, no-store' })
    expect(updates.at(-1)?.params).toContain('provider-network')
    expect(readCause).not.toHaveBeenCalled()
  })

  it('keeps real response JSON syntax errors in their existing classification without debug', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('PROD', false)
    network.mockResolvedValue(new Response('not-json'))
    expect(await readyKakaoPayReport(ctx())).toEqual({ ok: false, code: 'provider-json-invalid', cacheControl: 'private, no-store' })
    expect(updates.at(-1)?.params).toContain('provider-json-invalid')
  })

  it('freezes the complete report and saves tid before returning only the redirect', async () => {
    const result = await readyKakaoPayReport(ctx())
    expect(result).toEqual({ ok: true, redirectUrl: 'https://online-pay.kakaopay.com/mock-pc', cacheControl: 'private, no-store' })
    expect(row).toMatchObject({ buyer_id: 'buyer', profile_id: 'profile', report_year: 2026,
      cid: 'TC0ONETIME', environment: 'test', status: 'ready', processing_phase: 'preparing', expected_total_amount: 1000 })
    expect(JSON.parse(String(row?.draft_report_json))).toEqual(draft.report)
    expect(updates[0]?.params).toContain('T-mock')
    expect(updates[0]?.params).toContain('awaiting_user')
    expect(network).toHaveBeenCalledTimes(1)
    expect(queries.join(' ')).not.toMatch(/report_entitlements|report_snapshots/)
  })

  it('sends only allowlisted product fields and uses Worker secret auth', async () => {
    await readyKakaoPayReport(ctx())
    const [url, init] = network.mock.calls[0]!
    expect(url).toBe('https://open-api.kakaopay.com/online/v1/payment/ready')
    expect(init?.headers).toEqual({ Authorization: 'SECRET_KEY mock-secret', 'Content-Type': 'application/json' })
    expect(init?.redirect).toBe('manual')
    const body = JSON.parse(String(init?.body))
    expect(Object.keys(body).sort()).toEqual(['cid', 'partner_order_id', 'partner_user_id', 'item_name', 'quantity',
      'total_amount', 'tax_free_amount', 'approval_url', 'cancel_url', 'fail_url'].sort())
    expect(body).toMatchObject({ item_name: '2026년 사주 상세 리포트', quantity: 1, total_amount: 1000 })
    expect(body.partner_order_id).toBe(row?.partner_order_id)
    expect(row?.idempotency_key).not.toBe(body.partner_order_id)
    for (const [field, path] of [['approval_url', 'success'], ['cancel_url', 'cancel'], ['fail_url', 'fail']]) {
      expect(new URL(body[field!]).pathname).toBe(`/api/payments/kakaopay/${path}`)
    }
    const state = new URL(body.approval_url).searchParams.get('state')!
    expect(state).toMatch(/^[0-9a-f]{64}$/)
    expect(row?.callback_state_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row?.callback_state_hash).not.toBe(state)
    expect(JSON.stringify(row)).not.toMatch(/pg_token|mock-secret/)
  })

  it('selects the mobile redirect when requested', async () => {
    expect(await readyKakaoPayReport({ ...ctx(), redirectTarget: 'mobile' })).toMatchObject({ ok: true,
      redirectUrl: 'https://online-pay.kakaopay.com/mock-mobile' })
  })

  it.each(['secret', 'origin', 'year', 'missing-profile', 'invalid-profile', 'entitled', 'active', 'conflict', 'insert-fails', 'draft-fails', 'empty'])(
    'blocks %s before the provider call', async (reason) => {
      const context = ctx()
      if (reason === 'secret') workerEnv.KAKAOPAY_SECRET_KEY = ''
      if (reason === 'origin') workerEnv.KAKAOPAY_CALLBACK_ORIGIN = 'http://untrusted.example/path'
      if (reason === 'year') context.reportYear = 2027
      if (reason === 'missing-profile') missingProfile = true
      if (reason === 'invalid-profile') invalidProfile = true
      if (reason === 'entitled') vi.mocked(findReportEntitlement).mockResolvedValue({ snapshotId: 's', purchaseId: 'p' })
      if (reason === 'active') active = true
      if (reason === 'conflict') conflict = true
      if (reason === 'insert-fails') insertFails = true
      if (reason === 'draft-fails') vi.mocked(buildResultReport).mockImplementation(() => { throw new Error('private') })
      if (reason === 'empty') vi.mocked(buildResultReport).mockImplementation(() => ({ ...structuredClone(draft),
        report: { ...structuredClone(draft.report), sections: [] } }))
      expect(await readyKakaoPayReport(context)).toMatchObject({ ok: false })
      expect(network).not.toHaveBeenCalled()
    })

  it('does not reissue ready for an existing attempt', async () => {
    const context = ctx()
    expect(await readyKakaoPayReport(context)).toMatchObject({ ok: true })
    expect(await readyKakaoPayReport(context)).toMatchObject({ ok: false, code: 'purchase-exists' })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('allows only the winning insert to call ready during concurrent requests', async () => {
    const context = ctx()
    const results = await Promise.all([readyKakaoPayReport(context), readyKakaoPayReport(context)])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(network).toHaveBeenCalledTimes(1)
  })

  it.each([
    [400, 'provider-rejected'], [401, 'provider-rejected'], [403, 'provider-rejected'],
    [422, 'provider-rejected'], [429, 'provider-http-429'], [500, 'provider-http-5xx'],
    [503, 'provider-http-5xx'], [599, 'provider-http-5xx'],
    [404, 'provider-http-other'], [408, 'provider-http-other'], [302, 'provider-http-other'],
    [301, 'provider-http-other'], [303, 'provider-http-other'],
    [307, 'provider-http-other'], [308, 'provider-http-other'],
  ] as const)('handles HTTP %i without retry or unlock', async (status, code) => {
    const res = new Response('sensitive provider error', { status,
      headers: status >= 300 && status < 400 ? { Location: 'https://sensitive.example/redirect' } : {},
    })
    const readHeader = vi.spyOn(res.headers, 'get')
    network.mockResolvedValue(res)
    const result = await readyKakaoPayReport(ctx())
    expect(result).toMatchObject({ ok: false, code })
    expect(res.bodyUsed).toBe(false)
    expect(readHeader).not.toHaveBeenCalled()
    expect(network.mock.calls[0]?.[1]?.redirect).toBe('manual')
    expect(JSON.stringify(result)).not.toContain('sensitive')
    expect(JSON.stringify(updates)).not.toContain('sensitive')
    expect(updates.at(-1)?.params).toContain(code)
    expect(updates.at(-1)?.params).toContain(code === 'provider-rejected' ? 'failed' : 'ready')
    expect(updates.at(-1)?.params).toContain(code === 'provider-rejected' ? 'complete' : 'reconciling')
    expect(network).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['missing-tid', 'provider-response-invalid'], ['unsafe-url', 'provider-response-invalid'],
    ['non-object', 'provider-response-invalid'], ['malformed-json', 'provider-json-invalid'],
    ['network', 'provider-network'], ['body-network', 'provider-network'],
    ['save-fails', 'storage-error'], ['save-no-row', 'storage-error'],
  ] as const)(
    'never returns a redirect on %s', async (reason, code) => {
      if (reason === 'missing-tid') network.mockResolvedValue(new Response('{}'))
      if (reason === 'unsafe-url') network.mockResolvedValue(new Response(JSON.stringify({ tid: 'T-mock', next_redirect_pc_url: 'https://evil.example' })))
      if (reason === 'malformed-json') network.mockResolvedValue(new Response('not-json'))
      if (reason === 'non-object') network.mockResolvedValue(new Response('null'))
      if (reason === 'network') network.mockRejectedValue(new Error('secret provider message'))
      if (reason === 'body-network') {
        const res = response()
        vi.spyOn(res, 'json').mockRejectedValue(new TypeError('private body transport error'))
        network.mockResolvedValue(res)
      }
      if (reason === 'save-fails') updateFails = true
      if (reason === 'save-no-row') noUpdate = true
      const result = await readyKakaoPayReport(ctx())
      expect(result).toMatchObject({ ok: false, code })
      if (code !== 'storage-error') {
        const storedCode = reason === 'network' ? 'provider-network-fetch-error-unknown'
          : reason === 'body-network' ? 'provider-network-response-body-typeerror-unknown' : code
        expect(updates.at(-1)?.params).toContain(storedCode)
        expect(updates.at(-1)?.params).toContain('ready')
        expect(updates.at(-1)?.params).toContain('reconciling')
      }
      expect(JSON.stringify([result, updates])).not.toMatch(/secret provider message|private body transport error|not-json/)
      expect(result).not.toHaveProperty('redirectUrl')
      expect(network).toHaveBeenCalledTimes(1)
    })

  it.each(['fetch', 'body'])('times out a stalled %s, aborts, and leaves the order reconciling', async (stage) => {
    vi.useFakeTimers()
    if (stage === 'fetch') network.mockImplementation(() => new Promise(() => {}))
    else {
      const res = response()
      vi.spyOn(res, 'json').mockImplementation(() => new Promise(() => {}))
      network.mockResolvedValue(res)
    }
    const pending = readyKakaoPayReport(ctx())
    // WebCrypto runs outside fake timers; allow draft hashes to complete first.
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(10001)
    expect(await pending).toMatchObject({ ok: false, code: 'provider-timeout' })
    expect(updates.at(-1)?.params).toContain('provider-timeout')
    expect(updates.at(-1)?.params).toContain('ready')
    expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(updates.at(-1)?.params).toContain('reconciling')
    expect(network).toHaveBeenCalledTimes(1)
  })
})
