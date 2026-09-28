import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb } from '../../../db/client'
import { anonymousBuyers, purchases, reportSnapshots, reportEntitlements, sajuProfiles } from '../../../db/schema'
import { reconcileKakaoPayReport } from './kakaopay-reconcile'
import { manuallyReconcilePurchase } from './manual-reconcile'
import { runManualReconcile } from '../../../../scripts/reconcile-purchase.mjs'

const { workerEnv } = vi.hoisted(() => ({ workerEnv: { KAKAOPAY_ENVIRONMENT: 'test', KAKAOPAY_CID: 'TC0ONETIME', KAKAOPAY_SECRET_KEY: 'mock-secret', saju_db: undefined as D1Database | undefined } }))
vi.mock('astro:env/server', () => ({}))
vi.mock('cloudflare:workers', () => ({ env: workerEnv }))
// Never create a remote proxy in tests; the CLI receives only disposable local D1.
vi.mock('wrangler', () => ({ getPlatformProxy: vi.fn() }))

let mf: Miniflare
let d1: D1Database
let db: ReturnType<typeof createDb>
let network: ReturnType<typeof vi.fn<typeof fetch>>
const state = 'a'.repeat(64)
const draft = JSON.stringify({ sections: [{ body: 'Existing private draft' }] })
const providerBody = () => ({ status: 'SUCCESS_PAYMENT', tid: 'mock-tid', cid: 'TC0ONETIME',
  partner_order_id: 'order', partner_user_id: 'buyer', quantity: 1, amount: { total: 1000, tax_free: 0 } })
const response = () => Response.json(providerBody())
const call = () => reconcileKakaoPayReport({ db, purchaseId: 'purchase' })
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
  workerEnv.KAKAOPAY_ENVIRONMENT = 'test'
  workerEnv.KAKAOPAY_CID = 'TC0ONETIME'
  await d1.batch(['report_entitlements', 'report_snapshots', 'purchases', 'anonymous_buyers', 'saju_profiles']
    .map((table) => d1.prepare(`DELETE FROM ${table}`)))
  const now = new Date()
  await db.insert(anonymousBuyers).values({ id: 'buyer', tokenHash: 'buyer-hash', createdAt: now,
    expiresAt: new Date(Date.now() + 60000) })
  await db.insert(sajuProfiles).values({ id: 'profile', birthDate: '1991-01-02', calendarType: 'solar', createdAt: now, updatedAt: now })
  await db.insert(purchases).values({ id: 'purchase', buyerId: 'buyer', profileId: 'profile', reportYear: 2026,
    provider: 'kakaopay', environment: 'test', cid: 'TC0ONETIME', tid: 'mock-tid',
    partnerOrderId: 'order', partnerUserId: 'buyer', productCode: 'saju-report-2026-test-v1', itemName: '2026년 사주 상세 리포트',
    expectedTotalAmount: 1000, expectedTaxFreeAmount: 0, status: 'ready', processingPhase: 'reconciling',
    idempotencyKey: 'key', requestFingerprint: 'fingerprint',
    callbackStateHash: createHash('sha256').update(state).digest('hex'), callbackExpiresAt: new Date(Date.now() + 60000),
    draftReportJson: draft, reportContextJson: '{}', reportSchemaVersion: 'v1', methodologyVersionsJson: '{}',
    referenceAt: now, inputHash: 'input-hash', reportHash: 'report-hash', createdAt: now, updatedAt: now })
  network = vi.fn<typeof fetch>().mockImplementation(async () => response())
  vi.stubGlobal('fetch', network)
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {})
  }
})
afterEach(() => {
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) expect(console[method]).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
afterAll(async () => { await mf?.dispose() })

describe('single purchase reconciliation (mock provider, local D1)', () => {
  it('queries stored identifiers and atomically approves the existing draft', async () => {
    expect(await call()).toEqual({ status: 'approved' })
    expect(network).toHaveBeenCalledTimes(1)
    const [url, options] = network.mock.calls[0]!
    expect(url).toBe('https://open-api.kakaopay.com/online/v1/payment/order')
    expect(options).toMatchObject({ method: 'POST', redirect: 'manual', signal: expect.any(AbortSignal),
      headers: { Authorization: 'SECRET_KEY mock-secret', 'Content-Type': 'application/json' } })
    expect(JSON.parse(String(options?.body))).toEqual({ cid: 'TC0ONETIME', tid: 'mock-tid' })
    expect(await stored()).toMatchObject({ status: 'approved', processingPhase: 'complete',
      draftReportJson: null, approvedTotalAmount: 1000, lastErrorCode: null, leaseToken: null })
    const snapshots = await db.select().from(reportSnapshots)
    const entitlements = await db.select().from(reportEntitlements)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({ purchaseId: 'purchase', reportJson: draft, reportHash: 'report-hash' })
    expect(entitlements).toHaveLength(1)
    expect(entitlements[0]).toMatchObject({ purchaseId: 'purchase', snapshotId: snapshots[0]!.id })
  })

  it.each(['cid', 'tid', 'partner_order_id', 'partner_user_id', 'amount'])('rejects %s mismatch', async (key) => {
    network.mockResolvedValue(Response.json({ ...providerBody(), [key]: key === 'amount' ? { total: 1 } : 'wrong' }))
    expect(await call()).toEqual({ status: 'reconciling', code: 'provider-response-invalid' })
    expect(await stored()).toMatchObject({ status: 'ready', processingPhase: 'reconciling', draftReportJson: draft })
    await noAccess()
  })

  it.each(['READY', 'SEND_TMS', 'OPEN_PAYMENT', 'SELECT_METHOD', 'ARS_WAITING', 'AUTH_PASSWORD',
    'ISSUED_SID', 'PART_CANCEL_PAYMENT', 'UNKNOWN'])('keeps %s reconciling', async (status) => {
    network.mockResolvedValue(Response.json({ ...providerBody(), status }))
    expect(await call()).toEqual({ status: 'reconciling' })
    expect(await stored()).toMatchObject({ status: 'ready', processingPhase: 'reconciling', leaseToken: null })
    await noAccess()
  })

  it.each([['CANCEL_PAYMENT', 'cancelled'], ['QUIT_PAYMENT', 'cancelled'],
    ['FAIL_PAYMENT', 'failed'], ['FAIL_AUTH_PASSWORD', 'failed']])('ends verified %s as %s', async (status, expected) => {
    network.mockResolvedValue(Response.json({ ...providerBody(), status }))
    expect(await call()).toEqual({ status: expected })
    expect(await stored()).toMatchObject({ status: expected, processingPhase: 'complete', leaseToken: null })
    await noAccess()
  })

  it.each([302, 400, 429, 500, 'network', 'json'] as const)('keeps uncertainty %s reconciling without retries', async (failure) => {
    if (failure === 'network') network.mockRejectedValue(new Error('private-provider-message'))
    else network.mockResolvedValue(new Response('private-provider-message', { status: failure === 'json' ? 200 : failure }))
    expect(await call()).toMatchObject({ status: 'reconciling' })
    expect(await stored()).toMatchObject({ status: 'ready', processingPhase: 'reconciling', leaseToken: null })
    expect(network).toHaveBeenCalledTimes(1)
    await noAccess()
  })

  it('times out after 10 seconds, including response body reads', async () => {
    const schedule = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler, delay, ...args) =>
      schedule(handler, delay === 10000 ? 20 : delay, ...args))
    network.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) } as Response)
    expect(await call()).toEqual({ status: 'reconciling', code: 'provider-timeout' })
    expect(network.mock.calls[0]![1]!.signal!.aborted).toBe(true)
    expect(network).toHaveBeenCalledTimes(1)
    await noAccess()
  })

  it('creates access only once on concurrent and repeated calls', async () => {
    const results = await Promise.all([call(), call()])
    expect(results).toContainEqual({ status: 'approved' })
    expect(await call()).toEqual({ status: 'approved' })
    expect(network).toHaveBeenCalledTimes(1)
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })

  it.each(['approved', 'failed', 'cancelled'] as const)('does not touch an already %s purchase', async (status) => {
    await db.update(purchases).set({ status, processingPhase: 'complete' })
    const before = await stored()
    expect(await call()).toEqual({ status })
    expect(await stored()).toEqual(before)
    expect(network).not.toHaveBeenCalled()
    await noAccess()
  })

  it.each(['preparing', 'awaiting_user', 'approving'] as const)('does not reconcile phase %s', async (processingPhase) => {
    await db.update(purchases).set({ processingPhase })
    expect(await call()).toEqual({ status: 'skipped' })
    expect(network).not.toHaveBeenCalled()
  })

  it('does not query without stored tid', async () => {
    await db.update(purchases).set({ tid: null })
    expect(await call()).toEqual({ status: 'reconciling', code: 'missing-data' })
    expect(network).not.toHaveBeenCalled()
  })

  it('keeps an active lease and reclaims it only after expiry', async () => {
    await db.update(purchases).set({ leaseToken: 'previous-lease', leaseExpiresAt: new Date(Date.now() + 60000) })
    expect(await call()).toEqual({ status: 'reconciling' })
    expect(network).not.toHaveBeenCalled()
    await db.update(purchases).set({ leaseExpiresAt: new Date(0) })
    expect(await call()).toEqual({ status: 'approved' })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it('takes the approval aid from PAYMENT details, not cancellation details', async () => {
    network.mockResolvedValue(Response.json({ ...providerBody(), payment_action_details: [
      { payment_action_type: 'CANCEL', aid: 'cancel-aid' },
      { payment_action_type: 'PAYMENT', aid: 'payment-aid' },
    ] }))
    expect(await call()).toEqual({ status: 'approved' })
    expect(await stored()).toMatchObject({ approvalAid: 'payment-aid' })
  })

  it('also validates identifiers before applying terminal status', async () => {
    network.mockResolvedValue(Response.json({ ...providerBody(), status: 'CANCEL_PAYMENT', tid: 'wrong' }))
    expect(await call()).toEqual({ status: 'reconciling', code: 'provider-response-invalid' })
    expect(await stored()).toMatchObject({ status: 'ready', processingPhase: 'reconciling' })
    await noAccess()
  })

  it('rolls back completion when entitlement insertion fails, then safely recovers', async () => {
    await d1.prepare("CREATE TRIGGER reject_grant BEFORE INSERT ON report_entitlements BEGIN SELECT RAISE(ABORT, 'test failure'); END").run()
    try {
      expect(await call()).toEqual({ status: 'reconciling', code: 'storage-error' })
      expect(await stored()).toMatchObject({ status: 'ready', processingPhase: 'reconciling', draftReportJson: draft })
      await noAccess()
    } finally { await d1.prepare('DROP TRIGGER reject_grant').run() }
    expect(await call()).toEqual({ status: 'approved' })
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })

  it('cannot grant access after losing its claim during the order query', async () => {
    network.mockImplementation(async () => {
      await db.update(purchases).set({ leaseToken: 'replacement-lease' })
      return response()
    })
    expect(await call()).toEqual({ status: 'reconciling', code: 'storage-error' })
    expect(await stored()).toMatchObject({ status: 'ready', leaseToken: 'replacement-lease' })
    await noAccess()
  })
})

describe('manual administrator entry (local D1 only)', () => {
  const manual = () => manuallyReconcilePurchase(db, 'purchase')

  it('runs exactly one reconciling purchase and safely repeats', async () => {
    expect(await manual()).toEqual({ status: 'approved' })
    expect(await manual()).toEqual({ status: 'approved' })
    expect(network).toHaveBeenCalledTimes(1)
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })

  it.each(['approved', 'failed', 'cancelled'] as const)('blocks terminal %s without changes', async (status) => {
    await db.update(purchases).set({ status, processingPhase: 'complete' })
    const before = await stored()
    expect(await manual()).toEqual({ status })
    expect(await stored()).toEqual(before)
    expect(network).not.toHaveBeenCalled()
    await noAccess()
  })

  it('returns only not-found for a missing purchase', async () => {
    expect(await manuallyReconcilePurchase(db, 'missing')).toEqual({ status: 'not-found' })
    expect(network).not.toHaveBeenCalled()
  })

  it.each(['preparing', 'awaiting_user', 'approving'] as const)('blocks non-reconciling phase %s', async (processingPhase) => {
    await db.update(purchases).set({ processingPhase })
    const before = await stored()
    expect(await manual()).toEqual({ status: 'skipped' })
    expect(await stored()).toEqual(before)
    expect(network).not.toHaveBeenCalled()
  })

  it('does not expose reconciliation diagnostics or provider data', async () => {
    network.mockRejectedValue(new Error('private-provider-message'))
    expect(await manual()).toEqual({ status: 'reconciling' })
  })

  it('loads the real server entry through the CLI without a listener or remote connection', async () => {
    const { getPlatformProxy } = await import('wrangler')
    const dispose = vi.fn(async () => {})
    const cache = { delete: vi.fn(async () => false), match: vi.fn(async () => undefined), put: vi.fn(async () => {}) }
    vi.mocked(getPlatformProxy).mockResolvedValue({
      env: { saju_db: d1, KAKAOPAY_ENVIRONMENT: 'test', KAKAOPAY_CID: 'TC0ONETIME' }, cf: {},
      ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} },
      caches: { default: cache, open: vi.fn(async () => cache) },
      dispose,
    })
    vi.stubEnv('KAKAOPAY_SECRET_KEY', 'mock-secret')
    const purchaseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    await db.update(purchases).set({ id: purchaseId })
    expect(await runManualReconcile([purchaseId])).toEqual({ status: 'approved' })
    expect(await runManualReconcile([purchaseId])).toEqual({ status: 'approved' })
    expect(network).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })

  it('refuses absent credentials or extra arguments before connecting', async () => {
    const { getPlatformProxy } = await import('wrangler')
    vi.mocked(getPlatformProxy).mockClear()
    const purchaseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    vi.stubEnv('KAKAOPAY_SECRET_KEY', '')
    expect(await runManualReconcile([purchaseId])).toEqual({ status: 'configuration-error' })
    expect(await runManualReconcile([purchaseId, 'another-purchase'])).toEqual({ status: 'invalid-input' })
    expect(await runManualReconcile([])).toEqual({ status: 'invalid-input' })
    expect(getPlatformProxy).not.toHaveBeenCalled()
    expect(network).not.toHaveBeenCalled()
  })

  it('returns only error if Cloudflare authentication fails', async () => {
    const { getPlatformProxy } = await import('wrangler')
    vi.mocked(getPlatformProxy).mockRejectedValue(new Error('private-authentication-error'))
    vi.stubEnv('KAKAOPAY_SECRET_KEY', 'mock-secret')
    expect(await runManualReconcile(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])).toEqual({ status: 'error' })
    expect(network).not.toHaveBeenCalled()
  })
})



describe('reconcile central payment configuration', () => {
  it.each(['live-test-cid', 'test-live-cid', 'missing-env', 'invalid-env', 'stored-env', 'stored-cid'])('blocks %s before provider calls', async (reason) => {
    if (reason === 'live-test-cid') workerEnv.KAKAOPAY_ENVIRONMENT = 'live'
    if (reason === 'test-live-cid') workerEnv.KAKAOPAY_CID = 'MOCKLIVE01'
    if (reason === 'missing-env') Reflect.deleteProperty(workerEnv, 'KAKAOPAY_ENVIRONMENT')
    if (reason === 'invalid-env') workerEnv.KAKAOPAY_ENVIRONMENT = 'invalid'
    if (reason === 'stored-env') await db.update(purchases).set({ environment: 'live' })
    if (reason === 'stored-cid') await db.update(purchases).set({ cid: 'MOCKLIVE01' })
    const before = await stored()
    expect(await call()).toEqual({ status: 'reconciling', code: 'configuration' })
    expect(await stored()).toEqual(before)
    expect(network).not.toHaveBeenCalled()
    await noAccess()
  })
  it('reconciles a matching synthetic live purchase', async () => {
    workerEnv.KAKAOPAY_ENVIRONMENT = 'live'
    workerEnv.KAKAOPAY_CID = 'MOCKLIVE01'
    await db.update(purchases).set({ environment: 'live', cid: 'MOCKLIVE01' })
    network.mockResolvedValue(Response.json({ ...providerBody(), cid: 'MOCKLIVE01' }))
    expect(await call()).toEqual({ status: 'approved' })
    expect((await db.select().from(reportEntitlements))[0]).toMatchObject({ environment: 'live' })
  })
})

describe('manual recovery of expired ready and approve leases', () => {
  const manual = () => manuallyReconcilePurchase(db, 'purchase')
  const stale = async (phase: 'preparing' | 'approving', tid: string | null = 'mock-tid') => {
    await db.update(purchases).set({ processingPhase: phase, tid,
      leaseToken: 'expired-owner', leaseExpiresAt: new Date(0) })
  }

  it('uses order lookup to complete stale approving once', async () => {
    await stale('approving')
    expect(await manual()).toEqual({ status: 'approved' })
    expect(await manual()).toEqual({ status: 'approved' })
    expect(network).toHaveBeenCalledTimes(1)
    expect(network.mock.calls[0]![0]).toBe('https://open-api.kakaopay.com/online/v1/payment/order')
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })

  it.each([['CANCEL_PAYMENT', 'cancelled'], ['FAIL_PAYMENT', 'failed']] as const)(
    'ends stale approving %s as %s', async (providerStatus, expected) => {
      await stale('approving')
      network.mockResolvedValue(Response.json({ ...providerBody(), status: providerStatus }))
      expect(await manual()).toEqual({ status: expected })
      expect(await stored()).toMatchObject({ status: expected, processingPhase: 'complete' })
      await noAccess()
    })

  it.each(['UNKNOWN', 'network', '429', '500'] as const)(
    'keeps stale approving %s reconciling', async (reason) => {
      await stale('approving')
      if (reason === 'network') network.mockRejectedValue(new Error('private-provider-message'))
      else if (reason === 'UNKNOWN') network.mockResolvedValue(Response.json({ ...providerBody(), status: reason }))
      else network.mockResolvedValue(new Response(null, { status: Number(reason) }))
      expect(await manual()).toEqual({ status: 'reconciling' })
      expect(await stored()).toMatchObject({ status: 'ready', processingPhase: 'reconciling', leaseToken: null })
      expect(network).toHaveBeenCalledTimes(1)
      await noAccess()
    })

  it.each(['approving', 'preparing'] as const)('never touches valid %s lease', async (phase) => {
    await db.update(purchases).set({ processingPhase: phase,
      leaseToken: 'active-owner', leaseExpiresAt: new Date(Date.now() + 60000) })
    const before = await stored()
    expect(await manual()).toEqual({ status: 'skipped' })
    expect(await stored()).toEqual(before)
    expect(network).not.toHaveBeenCalled()
  })

  it('uses order lookup when stale preparing has a stored tid', async () => {
    await stale('preparing')
    expect(await manual()).toEqual({ status: 'approved' })
    expect(await stored()).toMatchObject({ status: 'approved', processingPhase: 'complete' })
    expect(network).toHaveBeenCalledTimes(1)
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })

  it('closes stale preparing without tid so a new ready can start', async () => {
    await stale('preparing', null)
    expect(await manual()).toEqual({ status: 'failed' })
    expect(await manual()).toEqual({ status: 'failed' })
    expect(await stored()).toMatchObject({ status: 'failed', processingPhase: 'complete',
      lastErrorCode: 'ready-not-delivered', leaseToken: null, tid: null })
    expect(network).not.toHaveBeenCalled()
    await noAccess()
  })

  it('leaves stale preparing without tid unchanged under a different payment configuration', async () => {
    await stale('preparing', null)
    workerEnv.KAKAOPAY_ENVIRONMENT = 'live'
    workerEnv.KAKAOPAY_CID = 'MOCKLIVE01'
    const before = await stored()
    expect(await manual()).toEqual({ status: 'skipped' })
    expect(await stored()).toEqual(before)
    expect(network).not.toHaveBeenCalled()
  })

  it('claims stale approving only once across simultaneous calls', async () => {
    await stale('approving')
    const results = await Promise.all([manual(), manual()])
    expect(results).toContainEqual({ status: 'approved' })
    expect(network).toHaveBeenCalledTimes(1)
    expect(await db.select().from(reportSnapshots)).toHaveLength(1)
    expect(await db.select().from(reportEntitlements)).toHaveLength(1)
  })
})
