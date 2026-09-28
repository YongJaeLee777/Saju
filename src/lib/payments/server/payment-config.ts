import { env } from 'cloudflare:workers'

export type PaymentEnvironment = 'test' | 'live'
const isPaymentEnvironment = (value: unknown): value is PaymentEnvironment =>
  value === 'test' || value === 'live'

/** Server bindings only. Missing configuration never silently selects test/live. */
export function getPaymentIdentity() {
  const environment = env.KAKAOPAY_ENVIRONMENT
  const cid = env.KAKAOPAY_CID
  if (!isPaymentEnvironment(environment)) return null
  if (typeof cid !== 'string' || !/^[A-Za-z0-9]{10}$/.test(cid)) return null
  if ((environment === 'test') !== (cid === 'TC0ONETIME')) return null
  return { provider: 'kakaopay' as const, environment, cid }
}

export function getPaymentConfig() {
  const identity = getPaymentIdentity()
  const secret = env.KAKAOPAY_SECRET_KEY
  if (!identity || !secret?.trim()) return null
  return { ...identity, secret }
}

export function matchesPaymentConfig(purchase: { provider: string; environment: string; cid: string },
  config: NonNullable<ReturnType<typeof getPaymentIdentity>>) {
  return purchase.provider === config.provider && purchase.environment === config.environment && purchase.cid === config.cid
}
