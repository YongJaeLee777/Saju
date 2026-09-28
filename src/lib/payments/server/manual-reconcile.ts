import 'astro:env/server'
import { eq } from 'drizzle-orm'
import type { createDb } from '../../../db/client'
import { purchases } from '../../../db/schema'
import { reconcileKakaoPayReport } from './kakaopay-reconcile'

/** Local administrator CLI only. Return no identifiers or diagnostic payloads. */
export async function manuallyReconcilePurchase(db: ReturnType<typeof createDb>, purchaseId: string) {
  try {
    const [purchase] = await db.select({ status: purchases.status, phase: purchases.processingPhase })
      .from(purchases).where(eq(purchases.id, purchaseId)).limit(1)
    if (!purchase) return { status: 'not-found' as const }
    if (purchase.status !== 'ready') return { status: purchase.status }
    if (purchase.phase !== 'reconciling') return { status: 'skipped' as const }
    const result = await reconcileKakaoPayReport({ db, purchaseId })
    return { status: result.status }
  } catch {
    return { status: 'error' as const }
  }
}
