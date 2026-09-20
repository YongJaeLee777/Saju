import 'astro:env/server'
import { env } from 'cloudflare:workers'
import { and, eq, sql } from 'drizzle-orm'
import { purchases, sajuProfiles } from '../../../db/schema'
import { buildResultReport } from '../../saju/server/result-page'
import type { SajuInput } from '../../saju/types'
import { findReportEntitlement, getOrCreateAnonymousBuyer } from './report-access'
import { parseCallbackOrigin } from './callback-origin'

type Context = Pick<Parameters<typeof getOrCreateAnonymousBuyer>[0], 'db' | 'cookies'> & {
  profileId: string
  reportYear: number
  redirectTarget?: 'pc' | 'mobile'
}
type FailureCode = 'configuration' | 'invalid-input' | 'profile-not-found' | 'invalid-profile'
  | 'already-entitled' | 'purchase-exists' | 'empty-report' | 'draft-failed' | 'storage-error'
  | 'provider-rejected' | 'provider-http-429' | 'provider-http-5xx' | 'provider-http-other'
  | 'provider-network' | 'provider-timeout' | 'provider-json-invalid' | 'provider-response-invalid'
type NetworkDebug = {
  stage: 'fetch' | 'response-body'
  errorName: 'AbortError' | 'TypeError' | 'SyntaxError' | 'Error' | 'Unknown'
  category: 'aborted' | 'connection' | 'tls' | 'unknown'
}
type ReadyResult = ({ ok: true; redirectUrl: string } | { ok: false; code: FailureCode; debug?: NetworkDebug }) & {
  cacheControl: 'private, no-store'
}
const fail = (code: FailureCode): ReadyResult => ({ ok: false, code, cacheControl: 'private, no-store' })
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const cid = 'TC0ONETIME'
const environment = 'test'
const amount = 1000 // Test product only; live checkout is not supported here.
const itemName = '2026년 사주 상세 리포트'
const timeoutMs = 10000

function networkDebug(error: unknown, stage: NetworkDebug['stage']): NetworkDebug | undefined {
  if (import.meta.env.DEV !== true || import.meta.env.PROD !== false) return undefined
  // Never copy message, cause, stack, or arbitrary names/codes into diagnostics.
  try {
    const name = record(error) ? error.name : undefined
    const errorName = name === 'AbortError' || name === 'TypeError' || name === 'SyntaxError' || name === 'Error'
      ? name : 'Unknown'
    const cause = record(error) && record(error.cause) ? error.cause : undefined
    const codes = [record(error) ? error.code : undefined, cause?.code]
    const category = errorName === 'AbortError' ? 'aborted'
      : codes.some((code) => typeof code === 'string' && [
        'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_PROTOCOL_ERROR',
      ].includes(code)) ? 'tls'
      : codes.some((code) => typeof code === 'string' && [
        'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
        'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
      ].includes(code)) ? 'connection' : 'unknown'
    return { stage, errorName, category }
  } catch { return { stage, errorName: 'Unknown', category: 'unknown' } }
}

function callbackOrigin() {
  return parseCallbackOrigin(env.KAKAOPAY_CALLBACK_ORIGIN, environment)
}

function redirectUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !(url.hostname === 'kakaopay.com' || url.hostname.endsWith('.kakaopay.com'))) return null
    return url.href
  } catch { return null }
}

/** Test-CID ready only. Caller must enforce CSRF/rate limits before exposing HTTP.
 * No retries, logging, approval, snapshot creation, or entitlement writes.
 * An existing purchase is blocked, not resumed by reissuing ready.
 */
export async function readyKakaoPayReport(context: Context): Promise<ReadyResult> {
  const origin = callbackOrigin()
  const secret = env.KAKAOPAY_SECRET_KEY
  if (!origin || !secret?.trim()) return fail('configuration')
  if (typeof context.profileId !== 'string' || !context.profileId || context.reportYear !== 2026
    || (context.redirectTarget !== undefined && context.redirectTarget !== 'pc' && context.redirectTarget !== 'mobile')) {
    return fail('invalid-input')
  }
  const access = { ...context, environment: 'test' as const }
  let purchaseId: string | undefined
  let leaseToken: string | undefined
  let tid: string | undefined
  let providerStarted = false
  try {
    const buyer = await getOrCreateAnonymousBuyer(access)
    const [profile] = await context.db.select({
      birthDate: sajuProfiles.birthDate, birthTime: sajuProfiles.birthTime,
      gender: sajuProfiles.gender, calendarType: sajuProfiles.calendarType, isLeapMonth: sajuProfiles.isLeapMonth,
    }).from(sajuProfiles).where(eq(sajuProfiles.id, context.profileId)).limit(1)
    if (!profile) return fail('profile-not-found')
    if ((profile.gender !== 'male' && profile.gender !== 'female')
      || (profile.calendarType !== 'solar' && profile.calendarType !== 'lunar')) return fail('invalid-profile')
    if (await findReportEntitlement(access)) return fail('already-entitled')
    const [active] = await context.db.select({ id: purchases.id }).from(purchases).where(and(
      eq(purchases.buyerId, buyer.id), eq(purchases.profileId, context.profileId),
      eq(purchases.reportYear, context.reportYear), eq(purchases.environment, environment),
      sql`${purchases.status} IN ('ready', 'approved')`,
    )).limit(1)
    if (active) return fail('purchase-exists')

    const now = new Date(Math.floor(Date.now() / 1000) * 1000)
    const input: SajuInput = { ...profile, gender: profile.gender, calendarType: profile.calendarType }
    let draft: ReturnType<typeof buildResultReport>
    try { draft = buildResultReport(input, now) } catch { return fail('draft-failed') }
    if (draft.report.sections.length === 0) return fail('empty-report')
    const draftReportJson = JSON.stringify(draft.report)
    const id = crypto.randomUUID()
    const orderId = crypto.randomUUID()
    const idempotencyKey = crypto.randomUUID()
    const state = hex(crypto.getRandomValues(new Uint8Array(32)))
    const owner = crypto.randomUUID()
    const callback = (outcome: string) => {
      const url = new URL(`/api/payments/kakaopay/${outcome}`, origin)
      url.searchParams.set('order', orderId)
      url.searchParams.set('state', state)
      return url.href
    }
    // The partial UNIQUE constraint arbitrates simultaneous requests before any provider call.
    const inserted = await context.db.insert(purchases).values({
      id, buyerId: buyer.id, profileId: context.profileId, reportYear: context.reportYear,
      provider: 'kakaopay', environment, cid, partnerOrderId: orderId, partnerUserId: buyer.id,
      productCode: 'saju-report-2026-test-v1', itemName, quantity: 1, currency: 'KRW',
      expectedTotalAmount: amount, expectedTaxFreeAmount: 0,
      status: 'ready', processingPhase: 'preparing', idempotencyKey,
      requestFingerprint: await hash(JSON.stringify([buyer.id, context.profileId, context.reportYear, environment, amount])),
      callbackStateHash: await hash(state), callbackExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      leaseToken: owner, leaseExpiresAt: new Date(now.getTime() + 60 * 1000),
      draftReportJson, reportContextJson: JSON.stringify({
        profileId: context.profileId, reportYear: context.reportYear, referenceAt: now.toISOString(),
        pillars: draft.pillars, daewoonNotice: draft.daewoonNotice,
      }),
      reportSchemaVersion: 'deterministic-report-v1', methodologyVersionsJson: JSON.stringify(draft.report.methodologyVersions),
      referenceAt: now, inputHash: await hash(JSON.stringify(input)), reportHash: await hash(draftReportJson),
      createdAt: now, updatedAt: now,
    }).onConflictDoNothing().returning({ id: purchases.id })
    if (inserted.length !== 1) return fail('purchase-exists')
    purchaseId = id
    leaseToken = owner

    const saveFailure = async (code: FailureCode, definitive = false, debug?: NetworkDebug): Promise<ReadyResult> => {
      try {
        await context.db.update(purchases).set({
          status: definitive ? 'failed' : 'ready', processingPhase: definitive ? 'complete' : 'reconciling',
          lastErrorCode: code === 'provider-network' && debug
            && import.meta.env.DEV === true && import.meta.env.PROD === false
            ? `${code}-${debug.stage}-${debug.errorName.toLowerCase()}-${debug.category}` : code,
          ...(tid ? { tid } : {}),
          leaseToken: null, leaseExpiresAt: null, updatedAt: new Date(),
        }).where(and(eq(purchases.id, id), eq(purchases.status, 'ready'),
          eq(purchases.processingPhase, 'preparing'), eq(purchases.leaseToken, owner)))
      } catch { return fail('storage-error') }
      return fail(code)
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let invalidJson = false
    let debug: NetworkDebug | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('timeout')) }, timeoutMs)
      })
      providerStarted = true
      const result = await Promise.race([
        (async () => {
          let response: Response
          try {
            response = await fetch('https://open-api.kakaopay.com/online/v1/payment/ready', {
            method: 'POST', redirect: 'manual', signal: controller.signal,
            headers: { Authorization: `SECRET_KEY ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cid, partner_order_id: orderId, partner_user_id: buyer.id,
              item_name: itemName, quantity: 1, total_amount: amount, tax_free_amount: 0,
              approval_url: callback('approval'), cancel_url: callback('cancel'), fail_url: callback('fail') }),
            })
          } catch (error) {
            debug = networkDebug(error, 'fetch')
            throw error
          }
          if (!response.ok) return { status: response.status, data: null }
          try {
            return { status: response.status, data: await response.json() as unknown }
          } catch (error) {
            // Classify parsing separately from body transport errors; retain no error text.
            invalidJson = error instanceof SyntaxError
            debug = networkDebug(error, 'response-body')
            throw error
          }
        })(), timeout,
      ])
      clearTimeout(timer)
      if (result.status < 200 || result.status >= 300) {
        const definitive = [400, 401, 403, 422].includes(result.status)
        const code = definitive ? 'provider-rejected'
          : result.status === 429 ? 'provider-http-429'
          : result.status >= 500 && result.status <= 599 ? 'provider-http-5xx' : 'provider-http-other'
        return await saveFailure(code, definitive)
      }
      if (!record(result.data)) return await saveFailure('provider-response-invalid')
      if (typeof result.data.tid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(result.data.tid)) {
        return await saveFailure('provider-response-invalid')
      }
      tid = result.data.tid
      const url = redirectUrl(context.redirectTarget === 'mobile'
        ? result.data.next_redirect_mobile_url : result.data.next_redirect_pc_url)
      if (!url) return await saveFailure('provider-response-invalid')
      try {
        const saved = await context.db.update(purchases).set({
          tid, processingPhase: 'awaiting_user', leaseToken: null, leaseExpiresAt: null, updatedAt: new Date(),
        }).where(and(eq(purchases.id, id), eq(purchases.status, 'ready'),
          eq(purchases.processingPhase, 'preparing'), eq(purchases.leaseToken, owner))).returning({ id: purchases.id })
        if (saved.length !== 1) return fail('storage-error')
      } catch { return await saveFailure('storage-error') }
      return { ok: true, redirectUrl: url, cacheControl: 'private, no-store' }
    } catch {
      const failure = await saveFailure(timedOut ? 'provider-timeout'
        : invalidJson ? 'provider-json-invalid' : 'provider-network', false, debug)
      // Internal service result only; the HTTP route deliberately projects a generic message.
      if (!failure.ok && failure.code === 'provider-network' && debug
        && import.meta.env.DEV === true && import.meta.env.PROD === false) return { ...failure, debug }
      return failure
    } finally { clearTimeout(timer) }
  } catch {
    // Never propagate Drizzle/provider errors: their messages can contain request parameters.
    // If storage failed after the provider call, leave the order blocked for reconciliation.
    if (providerStarted && purchaseId && leaseToken) {
      try {
        await context.db.update(purchases).set({ processingPhase: 'reconciling', lastErrorCode: 'storage-error',
          ...(tid ? { tid } : {}), updatedAt: new Date() }).where(and(
          eq(purchases.id, purchaseId), eq(purchases.status, 'ready'), eq(purchases.leaseToken, leaseToken),
        ))
      } catch { /* Preserve the existing row; no retry and no sensitive diagnostics. */ }
    }
    return fail('storage-error')
  }
}
