import 'astro:env/server'
import { and, eq, sql } from 'drizzle-orm'
import type { createDb } from '../../../db/client'
import { purchases, reportEntitlements, reportSnapshots } from '../../../db/schema'
import type { PaymentPurchase } from './purchase-select'

/** Atomic finalization shared by approval and order reconciliation. */
export async function completePurchase(db: ReturnType<typeof createDb>, purchase: PaymentPurchase,
  lease: string, phase: 'approving' | 'reconciling', approvalAid: string | null) {
  const now = new Date()
  const snapshotId = crypto.randomUUID()
  const owned = and(eq(purchases.id, purchase.id), eq(purchases.status, 'ready'),
    eq(purchases.processingPhase, phase), eq(purchases.leaseToken, lease))
  // A lost claim produces NULL and violates report_json NOT NULL, rolling back
  // the whole batch. No snapshot/entitlement can survive a stale worker's write.
  await db.batch([
    db.insert(reportSnapshots).values({ id: snapshotId, purchaseId: purchase.id,
      profileId: purchase.profileId, reportYear: purchase.reportYear,
      reportJson: sql<string>`(SELECT ${purchases.draftReportJson} FROM ${purchases} WHERE ${owned})`,
      schemaVersion: purchase.reportSchemaVersion, methodologyVersionsJson: purchase.methodologyVersionsJson,
      referenceAt: purchase.referenceAt, inputHash: purchase.inputHash, reportHash: purchase.reportHash, createdAt: now }),
    db.insert(reportEntitlements).values({ id: crypto.randomUUID(), buyerId: purchase.buyerId,
      profileId: purchase.profileId, reportYear: purchase.reportYear, environment: purchase.environment,
      purchaseId: purchase.id, snapshotId, grantedAt: now }),
    db.update(purchases).set({ status: 'approved', processingPhase: 'complete', approvalAid,
      approvedTotalAmount: purchase.expectedTotalAmount, approvedAt: now, draftReportJson: null,
      lastErrorCode: null, leaseToken: null, leaseExpiresAt: null, updatedAt: now,
    }).where(owned),
  ])
}
