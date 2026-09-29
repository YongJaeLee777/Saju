import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { createDb } from '../../../db/client'
import { generatePaidReport, loadPaidReport } from '../../../lib/payments/server/paid-report'
import { getPaymentIdentity } from '../../../lib/payments/server/payment-config'

export const prerender = false

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const response = (body: unknown, status = 200) => Response.json(body, { status, headers })

export const ALL = (async ({ request, params, cookies, url }) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return Response.json({ status: 'failed' }, { status: 405, headers: { ...headers, Allow: 'GET, POST' } })
  }
  const profileId = params.id
  const payment = getPaymentIdentity()
  if (!profileId || !payment) return response({ status: 'failed' }, 404)
  if (request.method === 'POST') {
    const origin = request.headers.get('Origin')
    const fetchSite = request.headers.get('Sec-Fetch-Site')
    if (origin !== url.origin || (fetchSite !== null && fetchSite !== 'same-origin')) {
      return response({ status: 'failed' }, 403)
    }
  }
  const context = {
    db: createDb(env.saju_db), cookies, environment: payment.environment, profileId, reportYear: 2026,
  }
  try {
    const paid = request.method === 'POST'
      ? await generatePaidReport(context)
      : await loadPaidReport(context)
    if (!paid.entitled) return response({ status: 'unpaid' }, 403)
    return response({ status: paid.status })
  } catch {
    return response({ status: 'failed' }, 500)
  }
}) satisfies APIRoute
