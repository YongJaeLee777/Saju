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

  it.each(['http', 'network', 'invalid-response', 'invalid-json'])('shows an API/response error for %s failure', async (failure) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('provider tid/order details')
      if (failure === 'http') return Response.json({ message: 'provider tid/order details' }, { status: 502 })
      if (failure === 'invalid-json') return new Response('invalid')
      return Response.json({})
    }))
    const button = { disabled: false }
    const message = { textContent: '' }
    const navigate = vi.fn()
    await startReportPurchase(button, message, 'profile', navigate)
    expect(button.disabled).toBe(false)
    expect(message.textContent).toBe('결제를 시작할 수 없습니다.')
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each(['not-a-url', 'javascript:alert(1)', 'https://example.com/payment'])('shows a URL validation error for an invalid redirect %#', async (redirectUrl) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ redirectUrl })))
    const button = { disabled: false }
    const message = { textContent: '' }
    const navigate = vi.fn()
    await startReportPurchase(button, message, 'profile', navigate)
    expect(message.textContent).toBe('결제 주소를 확인할 수 없습니다.')
    expect(button.disabled).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows a navigation error when navigation throws synchronously', async () => {
    const redirectUrl = 'https://online-payment.kakaopay.com/mockup/example'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ redirectUrl })))
    const button = { disabled: false }
    const message = { textContent: '' }
    const navigate = vi.fn(() => { throw new Error('private navigation details') })
    await startReportPurchase(button, message, 'profile', navigate)
    expect(message.textContent).toBe('결제 화면으로 이동하지 못했습니다.')
    expect(button.disabled).toBe(false)
    expect(navigate).toHaveBeenCalledExactlyOnceWith(redirectUrl)
  })
})
