import { fileURLToPath, pathToFileURL } from 'node:url'

// Run from an administrator's machine: node scripts/reconcile-purchase.mjs <purchase-id>
// Requires Wrangler login (or a Cloudflare API token with remote D1 access)
// and KAKAOPAY_SECRET_KEY in the process environment. Never pass secrets as args.
export async function runManualReconcile(args) {
  if (args.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args[0])) {
    return { status: 'invalid-input' }
  }
  if (!process.env.KAKAOPAY_SECRET_KEY?.trim()) return { status: 'configuration-error' }

  // Disable Wrangler console and disk diagnostics, including inherited debug settings.
  process.env.WRANGLER_LOG = 'none'
  process.env.WRANGLER_WRITE_LOGS = 'false'
  process.env.WRANGLER_LOG_SANITIZE = 'true'
  process.env.WRANGLER_SEND_METRICS = 'false'
  let platform
  let loader
  let result = { status: 'error' }
  try {
    const { getPlatformProxy } = await import('wrangler')
    const { createServer } = await import('vite')
    platform = await getPlatformProxy({
      configPath: fileURLToPath(new URL('../wrangler.reconcile.jsonc', import.meta.url)),
      persist: false, remoteBindings: true, envFiles: [],
    })
    // Reuse the installed Astro/Vite TS loader without starting an HTTP listener.
    // These two virtual modules adapt server-only imports to this local Node process.
    loader = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      configFile: false, envFile: false, logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [{
        name: 'manual-reconcile-runtime',
        resolveId(id) {
          if (id === 'astro:env/server' || id === 'cloudflare:workers') return `\0${id}`
        },
        load(id) {
          if (id === '\0astro:env/server') return 'export {}'
          if (id === '\0cloudflare:workers') return 'export const env = {}'
        },
      }],
    })
    const runtime = await loader.ssrLoadModule('cloudflare:workers')
    Object.assign(runtime.env, { saju_db: platform.env.saju_db, KAKAOPAY_SECRET_KEY: process.env.KAKAOPAY_SECRET_KEY })
    const { createDb } = await loader.ssrLoadModule('/src/db/client.ts')
    const { manuallyReconcilePurchase } = await loader.ssrLoadModule('/src/lib/payments/server/manual-reconcile.ts')
    const outcome = await manuallyReconcilePurchase(createDb(platform.env.saju_db), args[0])
    const statuses = ['approved', 'failed', 'cancelled', 'reconciling', 'skipped', 'not-found', 'error']
    if (statuses.includes(outcome.status)) result = { status: outcome.status }
  } catch {
    // Never emit loader, D1, authentication, or provider exceptions.
  } finally {
    try { await loader?.close() } catch { /* No diagnostics. */ }
    try { await platform?.dispose() } catch { /* No diagnostics. */ }
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runManualReconcile(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (['invalid-input', 'configuration-error', 'error'].includes(result.status)) process.exitCode = 1
}
