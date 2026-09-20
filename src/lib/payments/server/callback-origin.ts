/** Local HTTP callbacks are allowed only in development with test payments. */
export function parseCallbackOrigin(value: string | undefined, environment: 'test' | 'live'): string | null {
  try {
    const url = new URL(value ?? '')
    const localDevelopment = import.meta.env.DEV === true && import.meta.env.PROD === false
      && environment === 'test'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && localDevelopment))
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}
