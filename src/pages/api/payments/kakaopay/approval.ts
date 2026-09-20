import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { createDb } from '../../../../db/client'
import { approveKakaoPayReport } from '../../../../lib/payments/server/kakaopay-approve'

export const prerender = false
export const ALL = (async ({ request, url }: { request: Request; url: URL }): Promise<Response> => {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
  const failure = (status: number) => Response.json({ received: false }, { status, headers })
  if (request.method !== 'GET') return Response.json({ message: 'Method not allowed' }, {
    status: 405, headers: { ...headers, Allow: 'GET' },
  })
  try {
    const pgToken = url.searchParams.get('pg_token')
    const order = url.searchParams.get('order')
    const state = url.searchParams.get('state')
    if (!pgToken?.trim() || !order || !state) return failure(400)
    const result = await approveKakaoPayReport({ db: createDb(env.saju_db), order, state, pgToken })
    if (result.ok) return Response.json({ received: true, approved: true }, { headers })
    return failure(result.code === 'invalid-callback' ? 400 : result.code === 'pending' ? 409
      : result.code === 'provider-failed' ? 502 : 500)
  } catch { return failure(500) }
}) satisfies APIRoute
