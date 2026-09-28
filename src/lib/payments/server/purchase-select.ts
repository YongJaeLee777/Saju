import { purchases } from '../../../db/schema'

// Shared projection for approval and reconciliation. Keep provider payloads and
// unrelated purchase columns out of these single-row hot-path reads.
export const paymentPurchaseColumns = {
  id: purchases.id,
  buyerId: purchases.buyerId,
  profileId: purchases.profileId,
  reportYear: purchases.reportYear,
  provider: purchases.provider,
  environment: purchases.environment,
  cid: purchases.cid,
  partnerOrderId: purchases.partnerOrderId,
  partnerUserId: purchases.partnerUserId,
  tid: purchases.tid,
  expectedTotalAmount: purchases.expectedTotalAmount,
  expectedTaxFreeAmount: purchases.expectedTaxFreeAmount,
  expectedVatAmount: purchases.expectedVatAmount,
  quantity: purchases.quantity,
  status: purchases.status,
  processingPhase: purchases.processingPhase,
  callbackExpiresAt: purchases.callbackExpiresAt,
  leaseToken: purchases.leaseToken,
  leaseExpiresAt: purchases.leaseExpiresAt,
  draftReportJson: purchases.draftReportJson,
  reportSchemaVersion: purchases.reportSchemaVersion,
  methodologyVersionsJson: purchases.methodologyVersionsJson,
  referenceAt: purchases.referenceAt,
  inputHash: purchases.inputHash,
  reportHash: purchases.reportHash,
} as const

export type PaymentPurchase = {
  [K in keyof typeof paymentPurchaseColumns]: typeof purchases.$inferSelect[K]
}
