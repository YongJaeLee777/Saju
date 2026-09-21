import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { and, eq, isNull } from 'drizzle-orm'
import { createDb } from '../../../db/client'
import { purchases } from '../../../db/schema'
import { callbackPurchaseFilter } from './callback-purchase'

type Callback = 'cancel' | 'fail'

export function createKakaoPayCallback(callback: Callback) {
  return (async ({ request, url }: { request: Request; url: URL }): Promise<Response> => {
    const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
    if (request.method !== 'GET') {
      return Response.json({ message: 'Method not allowed' }, {
        status: 405, headers: { ...headers, Allow: 'GET' },
      })
    }
    const failure = (status: number) => Response.json({ received: false }, { status, headers })
    try {
      const filter = await callbackPurchaseFilter(url.searchParams.get('order') ?? '', url.searchParams.get('state') ?? '')
      if (!filter) return failure(400)
      const db = createDb(env.saju_db)
      // Conditional UPDATE arbitrates with approval's awaiting_user -> approving claim.
      // Never terminate approving/reconciling: the provider may already have approved.
      const changed = await db.update(purchases).set({
        status: callback === 'cancel' ? 'cancelled' : 'failed', processingPhase: 'complete',
        lastErrorCode: callback === 'cancel' ? 'callback-cancelled' : 'callback-failed',
        leaseToken: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(and(filter, eq(purchases.status, 'ready'), eq(purchases.processingPhase, 'awaiting_user'),
        isNull(purchases.leaseToken), isNull(purchases.approvedAt), isNull(purchases.approvalAid),
        isNull(purchases.approvedTotalAmount),
      )).returning({ id: purchases.id })
      if (changed.length === 1) return Response.json(
        callback === 'cancel' ? { received: true, cancelled: true } : { received: true, failed: true }, { headers },
      )
      const [existing] = await db.select({ status: purchases.status, phase: purchases.processingPhase })
        .from(purchases).where(filter).limit(1)
      if (!existing) return failure(400)
      if (existing.status === 'approved' || existing.phase === 'complete'
        || existing.status === 'failed' || existing.status === 'cancelled') {
        return Response.json({ received: true }, { headers })
      }
      return failure(409)
    } catch {
      // Storage errors may contain SQL parameters. Do not expose or log them.
      return failure(500)
    }
  }) satisfies APIRoute
}
