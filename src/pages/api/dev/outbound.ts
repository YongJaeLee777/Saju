import type { APIRoute } from 'astro'

export const prerender = false

const headers = { 'Cache-Control': 'private, no-store' }
const enabled = () => import.meta.env.DEV === true && import.meta.env.PROD === false
type ErrorName = 'AbortError' | 'TypeError' | 'SyntaxError' | 'Error' | 'Unknown'

function errorName(error: unknown): ErrorName {
  try {
    const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
    return name === 'AbortError' || name === 'TypeError' || name === 'SyntaxError' || name === 'Error'
      ? name : 'Unknown'
  } catch { return 'Unknown' }
}

async function probe(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    // Fixed destinations, no credentials/body, no redirect following or retries.
    const response = await fetch(url, {
      method: 'HEAD', redirect: 'manual', credentials: 'omit', signal: controller.signal,
    })
    // A non-2xx response still proves an HTTPS response was received.
    return { fetchSucceeded: true, httpStatus: response.status }
  } catch (error) {
    return { fetchSucceeded: false, httpStatus: null, errorName: errorName(error) }
  } finally { clearTimeout(timer) }
}

export const GET: APIRoute = async () => {
  if (!enabled()) return new Response(null, { status: 404, headers })
  const [kakao, comparison] = await Promise.all([
    probe('https://open-api.kakaopay.com/'),
    probe('https://example.com/'),
  ])
  return Response.json({ kakao, comparison }, { headers })
}

export const ALL: APIRoute = () => new Response(null, {
  status: enabled() ? 405 : 404,
  headers: enabled() ? { ...headers, Allow: 'GET' } : headers,
})
