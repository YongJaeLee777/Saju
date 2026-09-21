import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb } from '../../../db/client'
import { anonymousBuyers, purchases, reportSnapshots, reportEntitlements, sajuProfiles } from '../../../db/schema'
import * as cancel from '../../../pages/api/payments/kakaopay/cancel'
import * as fail from '../../../pages/api/payments/kakaopay/fail'

const { workerEnv } = vi.hoisted(() => ({ workerEnv: { KAKAOPAY_SECRET_KEY: 'mock-secret', saju_db: undefined as D1Database | undefined } }))
vi.mock('astro:env/server', () => ({}))
vi.mock('cloudflare:workers', () => ({ env: workerEnv }))

let mf: Miniflare
let d1: D1Database
let db: ReturnType<typeof createDb>
let network: ReturnType<typeof vi.fn<typeof fetch>>
const state = 'a'.repeat(64)
const draft = JSON.stringify({ sections: [{ body: 'Existing private draft' }] })
const stored = async () => (await db.select().from(purchases))[0]!
const noAccess = async () => {
  expect(await db.select().from(reportSnapshots)).toEqual([])
  expect(await db.select().from(reportEntitlements)).toEqual([])
}

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['saju_db'], compatibilityDate: '2026-09-08' }))
  d1 = await mf.getD1Database('saju_db')
  workerEnv.saju_db = d1
  db = createDb(d1)
  // Apply existing migrations only to this disposable in-memory D1 instance.
  for (const dir of readdirSync('drizzle').sort()) {
    const file = `drizzle/${dir}/migration.sql`
    if (!existsSync(file)) continue
    for (const statement of readFileSync(file, 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) await d1.prepare(statement).run()
    }
  }
}, 30000)

beforeEach(async () => {
  await d1.batch(['report_entitlements', 'report_snapshots', 'purchases', 'anonymous_buyers', 'saju_profiles']
    .map((table) => d1.prepare(`DELETE FROM ${table}`)))
  const now = new Date()
  await db.insert(anonymousBuyers).values({ id: 'buyer', tokenHash: 'buyer-hash', createdAt: now,
    expiresAt: new Date(Date.now() + 60000) })
  await db.insert(sajuProfiles).values({ id: 'profile', birthDate: '1991-01-02', calendarType: 'solar', createdAt: now, updatedAt: now })
  await db.insert(purchases).values({ id: 'purchase', buyerId: 'buyer', profileId: 'profile', reportYear: 2026,
    provider: 'kakaopay', environment: 'test', cid: 'TC0ONETIME', tid: 'mock-tid',
    partnerOrderId: 'order', partnerUserId: 'buyer', productCode: 'saju-report-2026-test-v1', itemName: '2026년 사주 상세 리포트',
    expectedTotalAmount: 1000, expectedTaxFreeAmount: 0, status: 'ready', processingPhase: 'awaiting_user',
    idempotencyKey: 'key', requestFingerprint: 'fingerprint',
    callbackStateHash: createHash('sha256').update(state).digest('hex'), callbackExpiresAt: new Date(Date.now() + 60000),
    draftReportJson: draft, reportContextJson: '{}', reportSchemaVersion: 'v1', methodologyVersionsJson: '{}',
    referenceAt: now, inputHash: 'input-hash', reportHash: 'report-hash', createdAt: now, updatedAt: now })
  network = vi.fn<typeof fetch>().mockRejectedValue(new Error('Provider calls forbidden'))
  vi.stubGlobal('fetch', network)
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {})
  }
})
afterEach(async () => {
  expect(network).not.toHaveBeenCalled()
  await noAccess()
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) expect(console[method]).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(async () => { await mf?.dispose() })

const routes = [
  { name: 'cancel', route: cancel, status: 'cancelled', body: { received: true, cancelled: true } },
  { name: 'fail', route: fail, status: 'failed', body: { received: true, failed: true } },
]

describe.each(routes)('$name callback (local D1 only)', ({ name, route, status, body }) => {
  async function call(query = `order=order&state=${state}`, method = 'GET') {
    const url = new URL(`https://saju.example/api/payments/kakaopay/${name}?${query}`)
    const originalGet = url.searchParams.get.bind(url.searchParams)
    vi.spyOn(url.searchParams, 'get').mockImplementation((key) => {
      if (key !== 'order' && key !== 'state') throw new Error('Unexpected query access')
      return originalGet(key)
    })
    const res = await route.ALL({ request: new Request(url, { method }), url })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false)
    return res
  }

  it('terminates only the state-authenticated purchase and creates no access', async () => {
    expect(route.prerender).toBe(false)
    const res = await call(`order=order&state=${state}&purchaseId=untrusted&tid=untrusted&pg_token=ignored`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(body)
    expect(await stored()).toMatchObject({ status, processingPhase: 'complete', leaseToken: null,
      lastErrorCode: name === 'cancel' ? 'callback-cancelled' : 'callback-failed' })
  })

  it.each(['missing', 'wrong-state', 'unknown-order', 'expired'])('rejects %s', async (reason) => {
    if (reason === 'expired') await db.update(purchases).set({ callbackExpiresAt: new Date(0) })
    const before = await stored()
    const query = reason === 'missing' ? '' : `order=${reason === 'unknown-order' ? 'unknown' : 'order'}&state=${reason === 'wrong-state' ? 'b'.repeat(64) : state}`
    const res = await call(query)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ received: false })
    expect(await stored()).toEqual(before)
  })

  it.each(['approved', 'failed', 'cancelled'] as const)('preserves terminal %s, including the opposite callback', async (terminal) => {
    await db.update(purchases).set({ status: terminal, processingPhase: 'complete',
      ...(terminal === 'approved' ? { approvedAt: new Date(), approvedTotalAmount: 1000, approvalAid: 'mock-aid' } : {}) })
    const before = await stored()
    expect((await call()).status).toBe(200)
    expect((await call()).status).toBe(200)
    expect(await stored()).toEqual(before)
  })

  it.each(['preparing', 'approving', 'reconciling'] as const)('leaves %s untouched for reconciliation', async (phase) => {
    await db.update(purchases).set({ processingPhase: phase, lastErrorCode: 'existing-error' })
    const before = await stored()
    expect((await call()).status).toBe(409)
    expect(await stored()).toEqual(before)
  })

  it('is idempotent under concurrent and repeated callbacks', async () => {
    const results = await Promise.all([call(), call()])
    expect(results.map((res) => res.status)).toEqual([200, 200])
    const before = await stored()
    expect((await call()).status).toBe(200)
    expect(await stored()).toEqual(before)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('rejects %s without writes', async (method) => {
    const before = await stored()
    const res = await call(undefined, method)
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET')
    expect(await stored()).toEqual(before)
  })
})