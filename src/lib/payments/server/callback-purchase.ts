import 'astro:env/server'
import { and, eq, gt } from 'drizzle-orm'
import { purchases } from '../../../db/schema'

/** Shared ready callback credential check. Never log the order or state. */
export async function callbackPurchaseFilter(order: string, state: string) {
  if (!order || order.length > 100 || !/^[0-9a-f]{64}$/.test(state)) return undefined
  const digest = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state)),
  ), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return and(
    eq(purchases.partnerOrderId, order), eq(purchases.callbackStateHash, digest),
    eq(purchases.provider, 'kakaopay'), eq(purchases.environment, 'test'), eq(purchases.cid, 'TC0ONETIME'),
    gt(purchases.callbackExpiresAt, new Date()),
  )
}
