import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AstroCookieSetOptions } from 'astro'
import { createDb } from '../../../db/client'
import { anonymousBuyers, purchases, reportEntitlements, reportSnapshots, sajuProfiles } from '../../../db/schema'
import { findReportEntitlement, getOrCreateAnonymousBuyer, loadEntitledReportSnapshot, prepareAnonymousBuyerRateLimit } from './report-access'
import { generatePaidReport, loadPaidReport } from './paid-report'
import { buildPaidNarrativeDraft } from '../../saju/server/paid-narrative-draft'
import { renderDeterministicNarrative } from '../../saju/narrative/deterministic-writer'
import { buildAiNarrativeRequest, type NarrativeJsonClient } from '../../saju/narrative/ai-writer'
import { AiTransportFailure } from '../../saju/narrative/ai-failure'

vi.mock('astro:env/server', () => ({}))
const ai = vi.hoisted(() => ({ complete: vi.fn<NarrativeJsonClient['complete']>() }))
vi.mock('../../saju/server/openai-narrative', () => ({ openAiNarrativeClient: ai }))

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
  ai.complete.mockReset()
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
  it('prepares a hashed rate key before D1 and issues a new buyer only after approval', async () => {
    const ctx = context()
    const identity = await prepareAnonymousBuyerRateLimit(ctx)
    expect(queries).toHaveLength(0)
    expect(ctx.cookies.set).not.toHaveBeenCalled()
    await identity.issueBuyer?.(db)
    const token = ctx.cookies.values.get(cookieKey)!
    expect(identity.key).toBe(digest(token))
    expect(identity.key).not.toBe(token)
    queries.length = 0
    expect(await prepareAnonymousBuyerRateLimit(ctx)).toEqual({ key: identity.key })
    expect(queries).toHaveLength(0)
    expect(ctx.cookies.set).toHaveBeenCalledTimes(1)
  })

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
  async function narrativeFixture() {
    const { ctx } = await paidFixture()
    const draft = buildPaidNarrativeDraft({ birthDate: '1988-09-13', birthTime: '13:04',
      gender: 'female', calendarType: 'solar', isLeapMonth: false }, date)
    const json = JSON.stringify(draft.report)
    await db.update(reportSnapshots).set({ reportJson: json, reportHash: digest(json), schemaVersion: 'paid-narrative-v1' })
    return { ctx, briefs: draft.report.paidNarrative.briefs }
  }

  async function legacyNarrativeFixture() {
    const { ctx } = await paidFixture()
    await db.update(sajuProfiles).set({ birthDate: '1988-09-13', birthTime: '13:04', gender: 'female' })
    const legacy = JSON.stringify({ title: '주제별 사주 요약', intro: '예전 안내', closing: '예전 마무리',
      sections: [{ headline: '예전 제목', body: '예전 유료 본문', scopeLabel: '올해' }] })
    await db.update(reportSnapshots).set({ reportJson: legacy, reportHash: digest(legacy) })
    return ctx
  }

  it('upgrades an entitled legacy snapshot into a reusable 12-chapter narrative', async () => {
    const ctx = await legacyNarrativeFixture()
    expect(await loadPaidReport(ctx)).toEqual({ entitled: true, status: 'generating', report: null })
    expect(ai.complete).not.toHaveBeenCalled()
    ai.complete.mockImplementation(async (request) => {
      const input = JSON.parse(request.input)
      expect(input.chapters).toHaveLength(12)
      expect(request.input).not.toContain('예전 유료 본문')
      const motif = input.chapters.find((chapter: { chapter: number }) => chapter.chapter === 2).motifRef
      const sourceRefs = [{ kind: 'motif', code: motif.code }]
      return { text: JSON.stringify({ chapters: [{ chapter: 2, title: '새 이야기의 시작',
        paragraphs: [{ text: '이 이미지를 이야기의 시작점으로 놓아둘게요.', sourceRefs }], sourceRefs }] }) }
    })
    const ready = await generatePaidReport(ctx)
    expect(ready.status).toBe('ready')
    expect(ready.report?.sections).toHaveLength(12)
    expect(ready.report?.sections.some((section) => section.headline === '새 이야기의 시작')).toBe(true)
    expect(JSON.stringify(ready)).not.toContain('예전 유료 본문')
    const [stored] = await db.select().from(reportSnapshots)
    expect(stored.schemaVersion).toBe('paid-narrative-v1')
    expect(stored.reportHash).toBe(digest(stored.reportJson))
    expect(stored.reportJson).not.toMatch(/예전 유료 본문|briefs|evidenceSummary/)
    expect(await loadPaidReport(ctx)).toEqual(ready)
    expect(await generatePaidReport(ctx)).toEqual(ready)
    expect(ai.complete).toHaveBeenCalledTimes(1)
  })

  it('lets only one concurrent legacy request call AI and stores a 12-chapter fallback on failure', async () => {
    const ctx = await legacyNarrativeFixture()
    ai.complete.mockRejectedValue(new Error('provider failure'))
    const results = await Promise.all([generatePaidReport(ctx), generatePaidReport(ctx)])
    expect(ai.complete).toHaveBeenCalledTimes(1)
    expect(results.every((result) => result.status === 'generating' || result.status === 'fallback_ready')).toBe(true)
    const ready = await loadPaidReport(ctx)
    expect(ready.status).toBe('fallback_ready')
    expect(ready.report?.sections).toHaveLength(12)
    expect(JSON.stringify(ready)).not.toContain('예전 유료 본문')
    expect(await generatePaidReport(ctx)).toEqual(ready)
    expect(ai.complete).toHaveBeenCalledTimes(1)
  })

  it('does not read or upgrade a legacy-like snapshot without entitlement', async () => {
    const ctx = await legacyNarrativeFixture()
    await db.delete(reportEntitlements)
    queries.length = 0
    expect(await generatePaidReport(ctx)).toEqual({ entitled: false, status: 'unpaid', report: null })
    expect(ai.complete).not.toHaveBeenCalled()
    expect(queries.join(' ')).not.toMatch(/report_snapshots|saju_profiles/)
  })

  it('makes one authorized narrative request, stores projected chapters and reuses them on later visits', async () => {
    const { ctx, briefs } = await narrativeFixture()
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(briefs.map((brief) => brief.chapter)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(buildAiNarrativeRequest(briefs).input.length).toBeLessThan(50_000)
    ai.complete.mockImplementation(async (request) => {
      const input = JSON.parse(request.input)
      expect(input.chapters).toHaveLength(briefs.length)
      expect(request.input).not.toMatch(/buyer|payment|birthDate|birthTime/)
      const motif = input.chapters.find((chapter: { chapter: number }) => chapter.chapter === 2).motifRef
      const sourceRefs = [{ kind: 'motif', code: motif.code }]
      return { text: JSON.stringify({ chapters: [{ chapter: 2, title: '이미지에서 시작하는 나의 이야기',
        paragraphs: [{ text: '이 이미지를 이야기의 시작점으로 놓아둘게요.', sourceRefs },
          { text: '이 이미지는 문학적인 비유예요.', sourceRefs }], sourceRefs }] }) }
    })
    expect(await loadPaidReport(ctx)).toEqual({ entitled: true, status: 'generating', report: null })
    expect(ai.complete).not.toHaveBeenCalled()
    const result = await generatePaidReport(ctx)
    expect(ai.complete).toHaveBeenCalledTimes(1)
    expect(result.entitled).toBe(true)
    expect(result.report?.sections).toHaveLength(briefs.length)
    expect(result.report?.sections).toHaveLength(12)
    expect(result.report?.sections.some((section) => section.headline === '이미지에서 시작하는 나의 이야기')).toBe(true)
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: 'paid_narrative_generation_complete', outcome: 'partial_ai', model: 'gpt-5.6-luna',
      fallbackChapterCount: 11, validationRejectCount: 0, snapshotSaved: true,
    })
    expect(JSON.stringify(result)).not.toMatch(/paidNarrative|sourceRefs|evidence|allowedPoints|buyer|snapshot/)
    await db.update(sajuProfiles).set({ birthDate: '2000-01-01' })
    expect(await loadPaidReport(ctx)).toEqual(result)
    expect(ai.complete).toHaveBeenCalledTimes(1)
    const [stored] = await db.select().from(reportSnapshots)
    expect(stored.reportHash).toBe(digest(stored.reportJson))
    expect(stored.reportJson).not.toMatch(/briefs|evidenceSummary/)
  })

  it('logs only allowlisted provider failure fields for a paid fallback', async () => {
    const { ctx } = await narrativeFixture()
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    ai.complete.mockRejectedValue(new AiTransportFailure('provider_http_error', 400,
      { type: 'invalid_request_error', code: 'invalid_json_schema', param: 'text.format.schema' }))
    const result = await generatePaidReport(ctx)
    expect(result.status).toBe('fallback_ready')
    expect(log).toHaveBeenCalledTimes(1)
    const event = JSON.parse(String(log.mock.calls[0]?.[0]))
    expect(event).toMatchObject({ event: 'paid_narrative_generation_complete', outcome: 'fallback',
      model: 'gpt-5.6-luna', fallbackChapterCount: 12, validationRejectCount: 0,
      safeFailureCode: 'provider_http_error', httpStatus: 400, stage: 'provider_response', snapshotSaved: true,
      providerError: { type: 'invalid_request_error', code: 'invalid_json_schema', param: 'text.format.schema' } })
    expect(event.durationMs).toEqual(expect.any(Number))
    expect(JSON.stringify(event)).not.toMatch(/briefs|evidence|sourceRefs|birthDate|buyer|payment|prompt|raw/)
  })

  it('atomically consumes one attempt across simultaneous paid visits and persists fallback on AI failure', async () => {
    const { ctx, briefs } = await narrativeFixture()
    ai.complete.mockRejectedValue(new Error('provider failure'))
    const results = await Promise.all([generatePaidReport(ctx), generatePaidReport(ctx)])
    expect(ai.complete).toHaveBeenCalledTimes(1)
    expect(results.some((result) => result.status === 'fallback_ready')).toBe(true)
    expect(results.every((result) => result.status === 'generating' || result.status === 'fallback_ready')).toBe(true)
    const ready = results.find((result) => result.status === 'fallback_ready')!
    expect(ready.report?.sections.map((section) => section.body)).toEqual(
      renderDeterministicNarrative(briefs).map((chapter) => chapter.paragraphs.map((p) => p.text).join('\n\n')))
    expect(await loadPaidReport(ctx)).toEqual(ready)
    expect(ai.complete).toHaveBeenCalledTimes(1)
  })

  it('never calls AI for a new-format snapshot without entitlement', async () => {
    const { ctx } = await narrativeFixture()
    await db.delete(reportEntitlements)
    queries.length = 0
    expect(await generatePaidReport(ctx)).toEqual({ entitled: false, status: 'unpaid', report: null })
    expect(ai.complete).not.toHaveBeenCalled()
    expect(queries.join(' ')).not.toContain('report_snapshots')
  })

  it('retains durable fallback and never retries AI if saving the response fails', async () => {
    const { ctx, briefs } = await narrativeFixture()
    const chapter = JSON.parse(buildAiNarrativeRequest(briefs).input).chapters[1]
    const sourceRefs = [{ kind: 'motif', code: chapter.motifRef.code }]
    ai.complete.mockResolvedValue({ text: JSON.stringify({ chapters: [{ chapter: 2,
      title: '이미지에서 시작하는 이야기', paragraphs: [{ text: '이 이미지를 시작점으로 놓아둘게요.', sourceRefs }],
      sourceRefs }] }) })
    const update = db.update.bind(db)
    let writes = 0
    vi.spyOn(db, 'update').mockImplementation((table) => {
      writes += 1
      if (writes === 2) throw new Error('simulated save failure')
      return update(table)
    })
    const result = await generatePaidReport(ctx)
    expect(writes).toBe(3)
    expect(result.report?.sections).toHaveLength(briefs.length)
    expect(await loadPaidReport(ctx)).toEqual(result)
    expect(ai.complete).toHaveBeenCalledTimes(1)
  })

  it('keeps corrupt stored briefs out of the AI request and returns a safe failed state', async () => {
    const { ctx } = await narrativeFixture()
    const [row] = await db.select().from(reportSnapshots)
    const data = JSON.parse(row.reportJson)
    data.paidNarrative.briefs[0].allowedPoints = null
    await db.update(reportSnapshots).set({ reportJson: JSON.stringify(data) })
    expect(await loadPaidReport(ctx)).toEqual({ entitled: true, status: 'generating', report: null })
    const result = await generatePaidReport(ctx)
    expect(result).toEqual({ entitled: true, status: 'failed', report: null })
    expect(ai.complete).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('paidNarrative')
  })

  it('treats a legacy paid snapshot as generating without exposing its body or reading the profile on GET', async () => {
    const { ctx } = await paidFixture()
    const report = { title: '구매 당시 제목', intro: '구매 당시 안내', closing: '구매 당시 마무리',
      sections: [{ headline: '고정된 제목', body: '구매 당시 유료 본문', scopeLabel: '올해' }] }
    await db.update(reportSnapshots).set({ reportJson: JSON.stringify({ ...report,
      provenance: ['private internal evidence'], edition: 'free' }) })
    await db.update(sajuProfiles).set({ birthDate: '2000-01-01' })
    queries.length = 0
    const display = await loadPaidReport(ctx)
    expect(display).toEqual({ entitled: true, status: 'generating', report: null })
    expect(JSON.stringify(display)).not.toMatch(/provenance|private internal evidence/)
    expect(queries).toHaveLength(3)
    expect(queries.join(' ')).not.toContain('saju_profiles')
  })

  it('returns no paid display content and does not query snapshots without entitlement', async () => {
    const { ctx } = await paidFixture()
    await db.delete(reportEntitlements)
    queries.length = 0
    const display = await loadPaidReport(ctx)
    expect(display).toEqual({ entitled: false, status: 'unpaid', report: null })
    expect(JSON.stringify(display)).not.toContain('paid body')
    expect(queries.join(' ')).not.toContain('report_snapshots')
  })

  it('keeps malformed legacy JSON out of the read-only paid display projection', async () => {
    const { ctx } = await paidFixture()
    await db.update(reportSnapshots).set({ reportJson: '{broken private data' })
    expect(await loadPaidReport(ctx)).toEqual({ entitled: true, status: 'generating', report: null })
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
