/** Only the profile ID crosses the ready boundary; provider errors stay private. */
export async function startReportPurchase(
  button: Pick<HTMLButtonElement, 'disabled'>,
  message: Pick<HTMLElement, 'textContent'>,
  profileId: string,
  navigate: (url: string) => void = (url) => { window.location.href = url },
) {
  if (button.disabled) return
  button.disabled = true
  message.textContent = '결제 페이지로 이동하고 있습니다…'
  try {
    const response = await fetch('/api/payments/kakaopay/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId }),
    })
    if (!response.ok) throw new Error()
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null || !('redirectUrl' in data)
      || typeof data.redirectUrl !== 'string') throw new Error()
    const url = new URL(data.redirectUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !(url.hostname === 'kakaopay.com' || url.hostname.endsWith('.kakaopay.com'))) throw new Error()
    navigate(data.redirectUrl)
  } catch {
    message.textContent = '결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.'
    button.disabled = false
  }
}
