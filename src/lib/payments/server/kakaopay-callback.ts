import type { APIRoute } from 'astro'

type Callback = 'cancel' | 'fail'

export function createKakaoPayCallback(callback: Callback) {
  return (({ request }: { request: Request; url: URL }): Response => {
    const headers = { 'Cache-Control': 'private, no-store' }
    if (request.method !== 'GET') {
      return Response.json({ message: 'Method not allowed' }, {
        status: 405, headers: { ...headers, Allow: 'GET' },
      })
    }
    return Response.json(
      callback === 'cancel' ? { received: true, cancelled: true } : { received: true, failed: true },
      { headers },
    )
  }) satisfies APIRoute
}
