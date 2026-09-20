import 'astro:env/server'
import type { AstroCookieSetOptions } from 'astro'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { createDb } from '../../../db/client'
import { anonymousBuyers, reportEntitlements, reportSnapshots } from '../../../db/schema'

type Environment = 'test' | 'live'
type Cookies = {
  get(name: string): { value: string } | undefined
  set(name: string, value: string, options: AstroCookieSetOptions): void
}
type BuyerContext = {
  db: ReturnType<typeof createDb>
  cookies: Cookies
  // Must come from server configuration, never a request parameter.
  environment: Environment
}
type ReportContext = BuyerContext & { profileId: string; reportYear: number }

const lifetimeSeconds = 365 * 24 * 60 * 60
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const hashToken = async (token: string) => hex(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
))

function cookieName(environment: Environment) {
  if (environment !== 'test' && environment !== 'live') throw new Error('Invalid payment environment')
  return `__Host-saju-buyer-${environment}`
}

async function findBuyer({ db, cookies, environment }: BuyerContext) {
  const token = cookies.get(cookieName(environment))?.value
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const [buyer] = await db.select({ id: anonymousBuyers.id, expiresAt: anonymousBuyers.expiresAt })
    .from(anonymousBuyers)
    .where(and(
      eq(anonymousBuyers.tokenHash, await hashToken(token)),
      isNull(anonymousBuyers.revokedAt),
      gt(anonymousBuyers.expiresAt, new Date()),
    )).limit(1)
  return buyer ?? null
}

/** Call only when buyer creation is needed; read-only access checks never create rows.
 * The caller must keep Set-Cookie responses out of shared caches.
 */
export async function getOrCreateAnonymousBuyer(context: BuyerContext) {
  const buyer = await findBuyer(context)
  if (buyer) return buyer

  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000)
  const expiresAt = new Date(createdAt.getTime() + lifetimeSeconds * 1000)
  const id = crypto.randomUUID()
  await context.db.insert(anonymousBuyers).values({
    id, tokenHash: await hashToken(token), createdAt, expiresAt,
  })
  // Publish the credential only after its hash has been stored successfully.
  context.cookies.set(cookieName(context.environment), token, {
    secure: true, httpOnly: true, sameSite: 'lax', path: '/',
    maxAge: lifetimeSeconds, expires: expiresAt,
  })
  return { id, expiresAt }
}

/** Authenticate from the cookie, then use the entitlement's full UNIQUE key.
 * No snapshot JSON is selected and missing/invalid cookies cause no writes.
 */
export async function findReportEntitlement(context: ReportContext) {
  if (!context.profileId || !Number.isInteger(context.reportYear)) return null
  const buyer = await findBuyer(context)
  if (!buyer) return null
  const [entitlement] = await context.db.select({
    snapshotId: reportEntitlements.snapshotId,
    purchaseId: reportEntitlements.purchaseId,
  }).from(reportEntitlements).where(and(
    eq(reportEntitlements.buyerId, buyer.id),
    eq(reportEntitlements.profileId, context.profileId),
    eq(reportEntitlements.reportYear, context.reportYear),
    eq(reportEntitlements.environment, context.environment),
    isNull(reportEntitlements.revokedAt),
  )).limit(1)
  return entitlement ?? null
}

/** Server-only data: project allowed fields before returning a paid HTTP response.
 * Never accepts a client-provided snapshot ID or a previously cached entitlement.
 */
export async function loadEntitledReportSnapshot(context: ReportContext) {
  const entitlement = await findReportEntitlement(context)
  if (!entitlement) return null
  const [snapshot] = await context.db.select({
    id: reportSnapshots.id,
    purchaseId: reportSnapshots.purchaseId,
    profileId: reportSnapshots.profileId,
    reportYear: reportSnapshots.reportYear,
    reportJson: reportSnapshots.reportJson,
    schemaVersion: reportSnapshots.schemaVersion,
    methodologyVersionsJson: reportSnapshots.methodologyVersionsJson,
    referenceAt: reportSnapshots.referenceAt,
    reportHash: reportSnapshots.reportHash,
  }).from(reportSnapshots).where(eq(reportSnapshots.id, entitlement.snapshotId)).limit(1)
  if (!snapshot || snapshot.purchaseId !== entitlement.purchaseId
    || snapshot.profileId !== context.profileId || snapshot.reportYear !== context.reportYear) return null
  return { snapshot, cacheControl: 'private, no-store' as const }
}
