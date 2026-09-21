import { afterEach, describe, expect, it, vi } from 'vitest'
import { startReportPurchase } from './report-purchase'

afterEach(() => vi.unstubAllGlobals())

describe('report purchase UI', () => {
  it('sends only profileId, prevents duplicate clicks, and navigates on success', async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const button = { disabled: false }
    const message = { textContent: '' }
    const navigate = vi.fn()
    const pending = startReportPurchase(button, message, 'profile', navigate)
    expect(button.disabled).toBe(true)
    expect(message.textContent).toContain('이동')
    await startReportPurchase(button, message, 'profile', navigate)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/payments/kakaopay/ready', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'profile' }),
    })
    const redirectUrl = 'https://online-payment.kakaopay.com/mockup/example'
    finish(Response.json({ redirectUrl }))
    await pending
    expect(navigate).toHaveBeenCalledExactlyOnceWith(redirectUrl)
    expect(button.disabled).toBe(true)
  })

  it.each(['http', 'network', 'invalid-url', 'invalid-json'])('shows only a generic error for %s failure', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('provider tid/order details')
      if (failure === 'http') return Response.json({ message: 'provider tid/order details' }, { status: 502 })
      if (failure === 'invalid-json') return new Response('invalid')
      return Response.json({ redirectUrl: 'javascript:alert(1)' })
    }))
    const button = { disabled: false }
    const message = { textContent: '' }
    const navigate = vi.fn()
    await startReportPurchase(button, message, 'profile', navigate)
    expect(button.disabled).toBe(false)
    expect(message.textContent).toBe('결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.')
    expect(navigate).not.toHaveBeenCalled()
  })
})
