import 'astro:env/server'
import { env } from 'cloudflare:workers'
import { and, eq, gt } from 'drizzle-orm'
import type { createDb } from '../../../db/client'
import { purchases, reportEntitlements, reportSnapshots } from '../../../db/schema'

type Context = { db: ReturnType<typeof createDb>; order: string; state: string; pgToken: string }
type Result = { ok: true } | { ok: false; code: 'invalid-callback' | 'configuration' | 'pending' | 'provider-failed' | 'storage-error' }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const hash = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
), (byte) => byte.toString(16).padStart(2, '0')).join('')

/** Test CID only. Tokens live only in memory; no provider payloads or exceptions are logged. */
export async function approveKakaoPayReport({ db, order, state, pgToken }: Context): Promise<Result> {
  if (!order || order.length > 100 || !/^[0-9a-f]{64}$/.test(state) || !pgToken.trim()) {
    return { ok: false, code: 'invalid-callback' }
  }
  let owned: { id: string; lease: string } | undefined
  const saveFailure = async (code: string, definitive = false) => {
    if (!owned) return
    await db.update(purchases).set({
      status: definitive ? 'failed' : 'ready', processingPhase: definitive ? 'complete' : 'reconciling',
      lastErrorCode: code, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date(),
    }).where(and(eq(purchases.id, owned.id), eq(purchases.status, 'ready'),
      eq(purchases.processingPhase, 'approving'), eq(purchases.leaseToken, owned.lease)))
  }
  try {
    const [purchase] = await db.select().from(purchases).where(and(
      eq(purchases.partnerOrderId, order), eq(purchases.callbackStateHash, await hash(state)),
      eq(purchases.provider, 'kakaopay'), eq(purchases.environment, 'test'), eq(purchases.cid, 'TC0ONETIME'),
      gt(purchases.callbackExpiresAt, new Date()),
    )).limit(1)
    if (!purchase) return { ok: false, code: 'invalid-callback' }
    if (purchase.status === 'approved' && purchase.processingPhase === 'complete') return { ok: true }
    if (purchase.status !== 'ready' || purchase.processingPhase !== 'awaiting_user') return { ok: false, code: 'pending' }
    if (!purchase.tid || !purchase.draftReportJson) return { ok: false, code: 'invalid-callback' }
    const secret = env.KAKAOPAY_SECRET_KEY
    if (!secret?.trim()) return { ok: false, code: 'configuration' }

    const lease = crypto.randomUUID()
    const claimed = await db.update(purchases).set({ processingPhase: 'approving', leaseToken: lease,
      leaseExpiresAt: new Date(Date.now() + 60000), updatedAt: new Date() }).where(and(
      eq(purchases.id, purchase.id), eq(purchases.status, 'ready'), eq(purchases.processingPhase, 'awaiting_user'),
      gt(purchases.callbackExpiresAt, new Date()),
    )).returning({ id: purchases.id })
    if (claimed.length !== 1) return { ok: false, code: 'pending' }
    owned = { id: purchase.id, lease }

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let result: { status: number; data: unknown }
    try {
      result = await Promise.race([
        (async () => {
          const response = await fetch('https://open-api.kakaopay.com/online/v1/payment/approve', {
            method: 'POST', redirect: 'manual', signal: controller.signal,
            headers: { Authorization: `SECRET_KEY ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cid: purchase.cid, tid: purchase.tid, partner_order_id: purchase.partnerOrderId,
              partner_user_id: purchase.partnerUserId, pg_token: pgToken }),
          })
          return { status: response.status, data: response.ok ? await response.json() : null }
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('timeout')) }, 10000)
        }),
      ])
    } catch {
      await saveFailure(timedOut ? 'provider-timeout' : 'provider-network')
      return { ok: false, code: 'pending' }
    } finally { clearTimeout(timer) }

    if (result.status < 200 || result.status >= 300) {
      // Match ready's conservative definition of a definitive rejection.
      const definitive = [400, 401, 403, 422].includes(result.status)
      await saveFailure(definitive ? 'provider-rejected' : 'provider-http-uncertain', definitive)
      return { ok: false, code: definitive ? 'provider-failed' : 'pending' }
    }
    const data = result.data
    if (!record(data) || data.tid !== purchase.tid || data.cid !== purchase.cid
      || data.partner_order_id !== purchase.partnerOrderId || data.partner_user_id !== purchase.partnerUserId
      || data.quantity !== purchase.quantity || !record(data.amount)
      || data.amount.total !== purchase.expectedTotalAmount || data.amount.tax_free !== purchase.expectedTaxFreeAmount
      || (purchase.expectedVatAmount !== null && data.amount.vat !== purchase.expectedVatAmount)
      || typeof data.aid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.aid)) {
      await saveFailure('provider-response-invalid')
      return { ok: false, code: 'pending' }
    }

    const now = new Date()
    const snapshotId = crypto.randomUUID()
    // D1 batch is atomic. UNIQUE conflicts roll back all three writes; never grant
    // partial access or rebuild the report from potentially changed profile data.
    await db.batch([
      db.insert(reportSnapshots).values({ id: snapshotId, purchaseId: purchase.id,
        profileId: purchase.profileId, reportYear: purchase.reportYear, reportJson: purchase.draftReportJson,
        schemaVersion: purchase.reportSchemaVersion, methodologyVersionsJson: purchase.methodologyVersionsJson,
        referenceAt: purchase.referenceAt, inputHash: purchase.inputHash, reportHash: purchase.reportHash, createdAt: now }),
      db.insert(reportEntitlements).values({ id: crypto.randomUUID(), buyerId: purchase.buyerId,
        profileId: purchase.profileId, reportYear: purchase.reportYear, environment: purchase.environment,
        purchaseId: purchase.id, snapshotId, grantedAt: now }),
      db.update(purchases).set({ status: 'approved', processingPhase: 'complete', approvalAid: data.aid,
        approvedTotalAmount: purchase.expectedTotalAmount, approvedAt: now, draftReportJson: null,
        lastErrorCode: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now,
      }).where(and(eq(purchases.id, purchase.id), eq(purchases.status, 'ready'),
        eq(purchases.processingPhase, 'approving'), eq(purchases.leaseToken, lease))),
    ])
    return { ok: true }
  } catch {
    try { await saveFailure('storage-error') } catch { /* Keep the existing claim blocked; no retries. */ }
    return { ok: false, code: 'storage-error' }
  }
}
