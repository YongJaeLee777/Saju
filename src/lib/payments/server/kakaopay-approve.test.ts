import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb } from '../../../db/client'
import { anonymousBuyers, purchases, reportSnapshots, reportEntitlements, sajuProfiles } from '../../../db/schema'
import { ALL, prerender } from '../../../pages/api/payments/kakaopay/approval'

const { workerEnv } = vi.hoisted(() => ({ workerEnv: { KAKAOPAY_SECRET_KEY: 'mock-secret', saju_db: undefined as D1Database | undefined } }))
vi.mock('astro:env/server', () => ({}))
vi.mock('cloudflare:workers', () => ({ env: workerEnv }))

let mf: Miniflare
let d1: D1Database
let db: ReturnType<typeof createDb>
let network: ReturnType<typeof vi.fn<typeof fetch>>
const state = 'a'.repeat(64)
const draft = JSON.stringify({ sections: [{ body: 'Existing private draft' }] })
const providerBody = () => ({ aid: 'mock-aid', tid: 'mock-tid', cid: 'TC0ONETIME',
  partner_order_id: 'order', partner_user_id: 'buyer', quantity: 1, amount: { total: 1000, tax_free: 0 } })
const response = () => Response.json(providerBody())
const call = (query = `order=order&state=${state}&pg_token=mock-token`, method = 'GET') => {
  const url = new URL(`https://saju.example/api/payments/kakaopay/approval?${query}`)
  return ALL({ request: new Request(url, { method }), url })
}
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
  network = vi.fn<typeof fetch>().mockResolvedValue(response())
  vi.stubGlobal('fetch', network)
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {})
  }
})
afterEach(() => {
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) expect(console[method]).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(async () => { await mf?.dispose() })

describe('approve callback (mock provider, local D1)', () => {
  it('uses stored identifiers, approves and atomically freezes the draft and grants access', async () => {
    const res = await call(`order=order&state=${state}&pg_token=mock-token&tid=evil&partner_order_id=evil&partner_user_id=evil`)
    expect(prerender).toBe(false)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, approved: true })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(network).toHaveBeenCalledTimes(1)
    const [url, options] = network.mock.calls[0]!
    expect(url).toBe('https://open-api.kakaopay.com/online/v1/payment/approve')
    expect(options).toMatchObject({ method: 'POST', redirect: 'manual', signal: expect.any(AbortSignal),
      headers: { Authorization: 'SECRET_KEY mock-secret', 'Content-Type': 'application/json' } })
    expect(JSON.parse(String(options?.body))).toEqual({ cid: 'TC0ONETIME', tid: 'mock-tid',
      partner_order_id: 'order', partner_user_id: 'buyer', pg_token: 'mock-token' })
    const purchase = await stored()
    expect(purchase).toMatchObject({ status: 'approved', processingPhase: 'complete', draftReportJson: null,
      approvalAid: 'mock-aid', approvedTotalAmount: 1000, leaseToken: null })
    const snapshots = await db.select().from(reportSnapshots)
    const entitlements = await db.select().from(reportEntitlements)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({ purchaseId: 'purchase', reportJson: draft, reportHash: 'report-hash' })
    expect(entitlements).toHaveLength(1)
    expect(entitlements[0]).toMatchObject({ buyerId: 'buyer', purchaseId: 'purchase', snapshotId: snapshots[0]!.id })
    expect(JSON.stringify([purchase, snapshots, entitlements])).not.toMatch(/mock-token|mock-secret/)
  })

  it.each(['', '&pg_token=', '&pg_token=%20'])('rejects missing/empty pg_token (%s)', async (suffix) => {
    expect((await call(`order=order&state=${state}${suffix}`)).status).toBe(400)
    expect(network).not.toHaveBeenCalled()
    await noAccess()
  })

  it.each(['wrong-state', 'expired'])('rejects %s before approve', async (reason) => {
    if (reason === 'expired') await db.update(purchases).set({ callbackExpiresAt: new Date(0) })
    const res = await call(`order=order&state=${reason === 'wrong-state' ? 'b'.repeat(64) : state}&pg_token=mock-token`)
    expect(res.status).toBe(400)
    expect(network).not.toHaveBeenCalled()
    await noAccess()
  })

  it.each(['POST', 'HEAD', 'OPTIONS'])('rejects %s without side effects', async (method) => {
    const res = await call(undefined, method)
    expect(res.status).toBe(405)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(network).not.toHaveBeenCalled()
    await noAccess()
  })

  it.each([400, 500, 429, 'network'] as const)('grants no access on provider failure %s', async (failure) => {
    if (failure === 'network') network.mockRejectedValue(new Error('private-provider-message'))
    else network.mockResolvedValue(new Response('private-provider-message', { status: failure }))
    const res = await call()
    expect(res.status).toBe(failure === 400 ? 502 : 409)
    expect(await res.json()).toEqual({ received: false })
    expect(await stored()).toMatchObject({ status: failure === 400 ? 'failed' : 'ready',
      processingPhase: failure === 400 ? 'complete' : 'reconciling' })
    await noAccess()
    await call()
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched successful provider response', async () => {
    network.mockResolvedValue(Response.json({ ...providerBody(), amount: { total: 1, tax_free: 0 } }))
    expect((await call()).status).toBe(409)
    expect(await stored()).toMatchObject({ processingPhase: 'reconciling' })
    await noAccess()
  })

  it('makes one approve call for concurrent and repeated callbacks', async () => {
    const results = await Promise.all([call(), call()])
    expect(results.map((res) => res.status)).toContain(200)
    expect((await call()).status).toBe(200)
    expect(network).toHaveBeenCalledTimes(1)
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })

  it('rolls back snapshot and purchase completion if entitlement insertion fails', async () => {
    await d1.prepare("CREATE TRIGGER reject_grant BEFORE INSERT ON report_entitlements BEGIN SELECT RAISE(ABORT, 'test failure'); END").run()
    try {
      expect((await call()).status).toBe(500)
      await noAccess()
      expect(await stored()).toMatchObject({ status: 'ready', processingPhase: 'reconciling', draftReportJson: draft })
      await call()
      expect(network).toHaveBeenCalledTimes(1)
    } finally { await d1.prepare('DROP TRIGGER reject_grant').run() }
  })
})
