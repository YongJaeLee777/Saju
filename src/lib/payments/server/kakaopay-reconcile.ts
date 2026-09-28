import 'astro:env/server'
import { getPaymentConfig, matchesPaymentConfig } from './payment-config'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDb } from '../../../db/client'
import { purchases } from '../../../db/schema'
import { completePurchase } from './complete-purchase'
import { paymentPurchaseColumns } from './purchase-select'

type Context = { db: ReturnType<typeof createDb>; purchaseId: string }
type Result = { status: 'approved' | 'failed' | 'cancelled' | 'reconciling' | 'skipped';
  code?: 'configuration' | 'missing-data' | 'provider-timeout' | 'provider-network'
    | 'provider-http-uncertain' | 'provider-response-invalid' | 'storage-error' }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Trusted server caller only; no public route or automatic retries. All provider
 * identifiers come from the stored purchase, never from browser input.
 */
export async function reconcileKakaoPayReport({ db, purchaseId }: Context): Promise<Result> {
  let lease: string | undefined
  const owned = () => and(eq(purchases.id, purchaseId), eq(purchases.status, 'ready'),
    eq(purchases.processingPhase, 'reconciling'), eq(purchases.leaseToken, lease!))
  const pending = async (code?: Result['code']): Promise<Result> => {
    await db.update(purchases).set({ lastErrorCode: code ?? null, leaseToken: null,
      leaseExpiresAt: null, updatedAt: new Date() }).where(owned())
    return { status: 'reconciling', ...(code ? { code } : {}) }
  }
  try {
    const [purchase] = await db.select(paymentPurchaseColumns).from(purchases).where(eq(purchases.id, purchaseId)).limit(1)
    if (!purchase) return { status: 'skipped' }
    if (purchase.status !== 'ready') return { status: purchase.status }
    const stale = (purchase.processingPhase === 'preparing' || purchase.processingPhase === 'approving')
      && purchase.leaseExpiresAt !== null && purchase.leaseExpiresAt <= new Date()
    if (purchase.processingPhase !== 'reconciling' && !stale) return { status: 'skipped' }
    if (stale && purchase.processingPhase === 'preparing' && !purchase.tid) {
      const config = getPaymentConfig()
      if (!config || !matchesPaymentConfig(purchase, config)) return { status: 'skipped' }
      // ready stores tid before returning any redirect URL. This purchase could
      // never have sent a payment URL to the browser, so a fresh ready is safe.
      const changed = await db.update(purchases).set({ status: 'failed', processingPhase: 'complete',
        lastErrorCode: 'ready-not-delivered', leaseToken: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(and(eq(purchases.id, purchaseId), eq(purchases.status, 'ready'),
        eq(purchases.processingPhase, 'preparing'), isNull(purchases.tid),
        lte(purchases.leaseExpiresAt, new Date()))).returning({ id: purchases.id })
      return { status: changed.length === 1 ? 'failed' : 'skipped' }
    }
    if (!purchase.tid || !purchase.cid || !purchase.draftReportJson) return { status: 'reconciling', code: 'missing-data' }
    const config = getPaymentConfig()
    if (!config || !matchesPaymentConfig(purchase, config)) return { status: 'reconciling', code: 'configuration' }
    const { secret } = config

    const token = crypto.randomUUID()
    const claimFilter = stale
      ? and(eq(purchases.processingPhase, purchase.processingPhase), lte(purchases.leaseExpiresAt, new Date()))
      : and(eq(purchases.processingPhase, 'reconciling'),
        or(isNull(purchases.leaseToken), lte(purchases.leaseExpiresAt, new Date())))
    const claimed = await db.update(purchases).set({ processingPhase: 'reconciling', leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + 60000), updatedAt: new Date() }).where(and(
      eq(purchases.id, purchaseId), eq(purchases.status, 'ready'), claimFilter,
    )).returning({ id: purchases.id })
    if (claimed.length !== 1) return { status: 'reconciling' }
    lease = token

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let result: { status: number; data: unknown }
    try {
      result = await Promise.race([
        (async () => {
          const response = await fetch('https://open-api.kakaopay.com/online/v1/payment/order', {
            method: 'POST', redirect: 'manual', signal: controller.signal,
            headers: { Authorization: `SECRET_KEY ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cid: purchase.cid, tid: purchase.tid }),
          })
          return { status: response.status, data: response.ok ? await response.json() : null }
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('timeout')) }, 10000)
        }),
      ])
    } catch {
      return await pending(timedOut ? 'provider-timeout' : 'provider-network')
    } finally { clearTimeout(timer) }
    if (result.status < 200 || result.status >= 300) return await pending('provider-http-uncertain')
    const data = result.data
    if (!record(data) || data.cid !== purchase.cid || data.tid !== purchase.tid
      || data.partner_order_id !== purchase.partnerOrderId || data.partner_user_id !== purchase.partnerUserId
      || !record(data.amount) || data.amount.total !== purchase.expectedTotalAmount) {
      return await pending('provider-response-invalid')
    }
    if (data.status === 'SUCCESS_PAYMENT') {
      // Order responses have no top-level aid. Preserve it only when a PAYMENT
      // action supplies one; do not fabricate an approval identifier.
      const action = Array.isArray(data.payment_action_details)
        ? data.payment_action_details.find((item: unknown) => record(item) && item.payment_action_type === 'PAYMENT') : undefined
      const aid = record(action) && typeof action.aid === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(action.aid)
        ? action.aid : null
      await completePurchase(db, purchase, token, 'reconciling', aid)
      return { status: 'approved' }
    }
    // Official order status definitions:
    // https://developers.kakaopay.com/docs/payment/online/payment-detail
    const terminal = data.status === 'CANCEL_PAYMENT' || data.status === 'QUIT_PAYMENT' ? 'cancelled'
      : data.status === 'FAIL_PAYMENT' || data.status === 'FAIL_AUTH_PASSWORD' ? 'failed' : null
    if (!terminal) return await pending() // Includes partial cancellations and unknown statuses.
    const changed = await db.update(purchases).set({ status: terminal, processingPhase: 'complete',
      lastErrorCode: terminal === 'cancelled' ? 'provider-order-cancelled' : 'provider-order-failed',
      leaseToken: null, leaseExpiresAt: null, updatedAt: new Date(),
    }).where(owned()).returning({ id: purchases.id })
    return { status: changed.length === 1 ? terminal : 'reconciling' }
  } catch {
    if (lease) {
      try { await pending('storage-error') } catch { /* Preserve claim; never log DB/provider exceptions. */ }
    }
    return { status: 'reconciling', code: 'storage-error' }
  }
}
