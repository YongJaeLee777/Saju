import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { createDb } from '../../../../db/client'
import { readyKakaoPayReport } from '../../../../lib/payments/server/kakaopay-ready'

export const prerender = false

const headers = { 'Cache-Control': 'private, no-store' }
const failure = (status: number) => Response.json(
  { message: '요청을 처리할 수 없습니다.' }, { status, headers },
)
type RouteContext = {
  request: Request
  cookies: Parameters<typeof readyKakaoPayReport>[0]['cookies']
}

export const POST = (async ({ request, cookies }: RouteContext): Promise<Response> => {
  try {
    // Cookie-authenticated POST: fail closed without Origin. Do not trust forwarded headers.
    const origin = request.headers.get('Origin')
    const fetchSite = request.headers.get('Sec-Fetch-Site')
    if (origin !== new URL(request.url).origin || (fetchSite !== null && fetchSite !== 'same-origin')) {
      return failure(403)
    }
    if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      return failure(415)
    }
    let body: unknown
    try { body = await request.json() } catch { return failure(400) }
    if (typeof body !== 'object' || body === null || Array.isArray(body)
      || Object.keys(body).length !== 1 || !('profileId' in body)
      || typeof body.profileId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.profileId)) {
      return failure(400)
    }

    // RATE-LIMIT INTEGRATION POINT: enforce the request budget here, before buyer
    // creation / D1 writes / provider calls. A limiter is intentionally not implemented yet.
    const result = await readyKakaoPayReport({
      db: createDb(env.saju_db), cookies, profileId: body.profileId, reportYear: 2026,
    })
    if (result.ok) return Response.json({ redirectUrl: result.redirectUrl }, { headers })
    const status = result.code === 'already-entitled' || result.code === 'purchase-exists' ? 409
      : result.code === 'invalid-input' || result.code === 'profile-not-found' ? 400
      : result.code.startsWith('provider-') ? 502 : 500
    return failure(status)
  } catch {
    // Never expose or log exception messages, provider details, or payment identifiers.
    return failure(500)
  }
}) satisfies APIRoute

export const ALL: APIRoute = () => Response.json(
  { message: '허용되지 않은 요청 방식입니다.' },
  { status: 405, headers: { ...headers, Allow: 'POST' } },
)
