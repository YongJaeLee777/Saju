import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AstroCookieSetOptions } from 'astro'
import { createDb } from '../../../db/client'
import { anonymousBuyers, purchases, reportEntitlements, reportSnapshots, sajuProfiles } from '../../../db/schema'
import { findReportEntitlement, getOrCreateAnonymousBuyer, loadEntitledReportSnapshot } from './report-access'
import { loadPaidReport } from './paid-report'

vi.mock('astro:env/server', () => ({}))

const cookieKey = '__Host-saju-buyer-test'
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const date = new Date('2026-09-19T00:00:00Z')
let mf: Miniflare
let d1: D1Database
let db: ReturnType<typeof createDb>
let queries: string[]

function cookieJar(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(cookieKey, initial)
  return {
    values,
    get: (name: string) => values.has(name) ? { value: values.get(name)! } : undefined,
    set: vi.fn((name: string, value: string, _options: AstroCookieSetOptions) => { values.set(name, value) }),
  }
}

const context = (cookies = cookieJar()) => ({
  db, cookies, environment: 'test' as const, profileId: 'profile', reportYear: 2026,
})

async function paidFixture() {
  const ctx = context()
  const buyer = await getOrCreateAnonymousBuyer(ctx)
  await db.insert(sajuProfiles).values({
    id: 'profile', birthDate: '1991-01-02', calendarType: 'solar', createdAt: date, updatedAt: date,
  })
  await db.insert(purchases).values({
    id: 'purchase', buyerId: buyer.id, profileId: 'profile', reportYear: 2026,
    provider: 'kakaopay', environment: 'test', cid: 'TC0ONETIME',
    partnerOrderId: 'order', partnerUserId: buyer.id, productCode: 'report', itemName: 'Report',
    expectedTotalAmount: 1000, expectedTaxFreeAmount: 0, status: 'approved', processingPhase: 'complete',
    idempotencyKey: 'request', requestFingerprint: 'fingerprint', callbackStateHash: 'state-hash',
    callbackExpiresAt: date, reportContextJson: '{}', reportSchemaVersion: 'v1',
    methodologyVersionsJson: '{}', referenceAt: date, inputHash: 'input', reportHash: 'report',
    createdAt: date, updatedAt: date,
  })
  await db.insert(reportSnapshots).values({
    id: 'snapshot', purchaseId: 'purchase', profileId: 'profile', reportYear: 2026,
    reportJson: '{"private":"paid body"}', schemaVersion: 'v1', methodologyVersionsJson: '{}',
    referenceAt: date, inputHash: 'input', reportHash: 'report', createdAt: date,
  })
  await db.insert(reportEntitlements).values({
    id: 'entitlement', buyerId: buyer.id, profileId: 'profile', reportYear: 2026,
    environment: 'test', purchaseId: 'purchase', snapshotId: 'snapshot', grantedAt: date,
  })
  queries.length = 0
  return { ctx, buyer }
}

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['saju_db'], compatibilityDate: '2026-09-08' }))
  d1 = await mf.getD1Database('saju_db')
  for (const dir of readdirSync('drizzle').sort()) {
    const file = `drizzle/${dir}/migration.sql`
    if (!existsSync(file)) continue
    for (const statement of readFileSync(file, 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) await d1.prepare(statement).run()
    }
  }
}, 30000)

beforeEach(async () => {
  vi.restoreAllMocks()
  await d1.batch(['report_entitlements', 'report_snapshots', 'purchases', 'anonymous_buyers', 'saju_profiles']
    .map((table) => d1.prepare(`DELETE FROM ${table}`)))
  queries = []
  // Miniflare bindings are RPC proxies; observe calls through a local adapter.
  db = createDb({
    prepare: (query) => { queries.push(query); return d1.prepare(query) },
    batch: d1.batch.bind(d1), exec: d1.exec.bind(d1),
    withSession: d1.withSession.bind(d1), dump: d1.dump.bind(d1),
  })
})

afterAll(async () => { await mf?.dispose() })

describe('anonymous buyer authentication', () => {
  it('creates a 256-bit cookie and persists only its SHA-256 hash', async () => {
    const ctx = context()
    const buyer = await getOrCreateAnonymousBuyer(ctx)
    const token = ctx.cookies.values.get(cookieKey)!
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const [row] = await db.select().from(anonymousBuyers)
    expect(row?.tokenHash).toBe(digest(token))
    expect(row?.id).toBe(buyer.id)
    expect(JSON.stringify(row)).not.toContain(token)
    expect(JSON.stringify(buyer)).not.toContain(token)
    expect(ctx.cookies.set).toHaveBeenCalledWith(cookieKey, token, {
      secure: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 31536000, expires: buyer.expiresAt,
    })
  })

  it('reuses a valid buyer without a write or extending cookie expiry', async () => {
    const ctx = context()
    const first = await getOrCreateAnonymousBuyer(ctx)
    queries.length = 0
    expect(await getOrCreateAnonymousBuyer(ctx)).toEqual(first)
    expect(ctx.cookies.set).toHaveBeenCalledTimes(1)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('"token_hash" = ?')
  })

  it.each(['', 'malformed', 'x'.repeat(4096), 'a'.repeat(64)])('replaces invalid/unrecognized cookie %#', async (invalid) => {
    const ctx = context(cookieJar(invalid))
    await getOrCreateAnonymousBuyer(ctx)
    expect(ctx.cookies.values.get(cookieKey)).not.toBe(invalid)
    expect(await db.select().from(anonymousBuyers)).toHaveLength(1)
  })

  it.each(['expired', 'revoked'] as const)('replaces a %s buyer', async (state) => {
    const ctx = context()
    const first = await getOrCreateAnonymousBuyer(ctx)
    await db.update(anonymousBuyers).set(state === 'expired'
      ? { expiresAt: new Date(0) } : { revokedAt: new Date() }).where(eq(anonymousBuyers.id, first.id))
    expect((await getOrCreateAnonymousBuyer(ctx)).id).not.toBe(first.id)
  })
})

describe('report entitlement and snapshot access', () => {
  it('supplies the frozen snapshot display text even after the profile changes', async () => {
    const { ctx } = await paidFixture()
    const report = { title: '구매 당시 제목', intro: '구매 당시 안내', closing: '구매 당시 마무리',
      sections: [{ headline: '고정된 제목', body: '구매 당시 유료 본문', scopeLabel: '올해' }] }
    await db.update(reportSnapshots).set({ reportJson: JSON.stringify({ ...report,
      provenance: ['private internal evidence'], edition: 'free' }) })
    await db.update(sajuProfiles).set({ birthDate: '2000-01-01' })
    queries.length = 0
    const display = await loadPaidReport(ctx)
    expect(display).toEqual({ entitled: true, report })
    expect(JSON.stringify(display)).not.toMatch(/provenance|private internal evidence/)
    expect(queries).toHaveLength(3)
    expect(queries.join(' ')).not.toContain('saju_profiles')
  })

  it('returns no paid display content and does not query snapshots without entitlement', async () => {
    const { ctx } = await paidFixture()
    await db.delete(reportEntitlements)
    queries.length = 0
    const display = await loadPaidReport(ctx)
    expect(display).toEqual({ entitled: false, report: null })
    expect(JSON.stringify(display)).not.toContain('paid body')
    expect(queries.join(' ')).not.toContain('report_snapshots')
  })

  it('keeps access but does not regenerate or expose malformed stored report JSON', async () => {
    const { ctx } = await paidFixture()
    await db.update(reportSnapshots).set({ reportJson: '{broken private data' })
    expect(await loadPaidReport(ctx)).toEqual({ entitled: true, report: null })
  })

  it('returns only entitlement metadata without reading report JSON', async () => {
    const { ctx } = await paidFixture()
    expect(await findReportEntitlement(ctx)).toEqual({ snapshotId: 'snapshot', purchaseId: 'purchase' })
    expect(queries).toHaveLength(2)
    expect(queries.join(' ')).not.toMatch(/report_snapshots|report_json/)
  })

  it('loads the snapshot by PK only after authentication and entitlement lookup', async () => {
    const { ctx } = await paidFixture()
    expect(await loadEntitledReportSnapshot(ctx)).toMatchObject({
      snapshot: { id: 'snapshot', reportJson: '{"private":"paid body"}' }, cacheControl: 'private, no-store',
    })
    expect(queries).toHaveLength(3)
    expect(queries[0]).toContain('anonymous_buyers')
    expect(queries[1]).toContain('report_entitlements')
    expect(queries[2]).toContain('"report_snapshots"."id" = ?')
  })

  it.each(['missing', 'revoked', 'buyer', 'profile', 'year', 'environment', 'expiredBuyer', 'revokedBuyer'] as const)
    ('denies %s access without any snapshot query', async (reason) => {
      const { ctx, buyer } = await paidFixture()
      if (reason === 'missing') await db.delete(reportEntitlements)
      if (reason === 'revoked') await db.update(reportEntitlements).set({ revokedAt: new Date() })
      if (reason === 'buyer') {
        ctx.cookies = cookieJar()
        await getOrCreateAnonymousBuyer(ctx)
      }
      if (reason === 'profile') ctx.profileId = 'other-profile'
      if (reason === 'year') ctx.reportYear = 2027
      if (reason === 'expiredBuyer' || reason === 'revokedBuyer') {
        await db.update(anonymousBuyers).set(reason === 'expiredBuyer'
          ? { expiresAt: new Date(0) } : { revokedAt: new Date() }).where(eq(anonymousBuyers.id, buyer.id))
      }
      if (reason === 'environment') {
        // Even possessing the same credential in the live cookie grants no test entitlement.
        ctx.cookies.values.set('__Host-saju-buyer-live', ctx.cookies.values.get(cookieKey)!)
      }
      queries.length = 0
      expect(await loadEntitledReportSnapshot(reason === 'environment' ? { ...ctx, environment: 'live' } : ctx)).toBeNull()
      expect(queries.join(' ')).not.toContain('report_snapshots')
    })

  it.each([undefined, 'bad-cookie'])('does not create a buyer on a free lookup (%s)', async (token) => {
    expect(await loadEntitledReportSnapshot(context(cookieJar(token)))).toBeNull()
    expect(queries).toEqual([])
  })

  it('rejects a snapshot whose profile/year does not match the entitlement', async () => {
    const { ctx } = await paidFixture()
    await db.update(reportSnapshots).set({ reportYear: 2027 })
    expect(await loadEntitledReportSnapshot(ctx)).toBeNull()
  })

  it('uses existing UNIQUE/PK indexes for all three access queries', async () => {
    const { ctx } = await paidFixture()
    await loadEntitledReportSnapshot(ctx)
    const sql = [...queries]
    expect(sql).toHaveLength(3)
    const params = [
      [digest(ctx.cookies.values.get(cookieKey)!), Math.floor(Date.now() / 1000), 1],
      [(await db.select({ id: anonymousBuyers.id }).from(anonymousBuyers))[0]!.id, 'profile', 2026, 'test', 1],
      ['snapshot', 1],
    ]
    const expected = ['anonymous_buyers_token_hash_unique', 'report_entitlements_buyer_report_unique', 'sqlite_autoindex_report_snapshots_1']
    for (let i = 0; i < sql.length; i++) {
      const plan = await d1.prepare(`EXPLAIN QUERY PLAN ${sql[i]}`).bind(...params[i]!).all<{ detail: string }>()
      expect(plan.results.map((row) => row.detail).join(' ')).toContain(expected[i])
      expect(plan.results.every((row) => !row.detail.includes('SCAN'))).toBe(true)
    }
  })
})
