import { fileURLToPath, pathToFileURL } from 'node:url'

const usage = 'Usage: node scripts/narrative-review.mjs --fixture <1-5>'
const labels = { hook: 'Hook', coreIdentity: 'Core Identity', socialSelf: 'Social Lens',
  privateSelf: 'Personal Lens', relationship: 'Relationship', work: 'Work',
  strengthInUse: 'Strength In Use', recurringPattern: 'Recurring Pattern',
  past: 'Past Flow', current: 'Current Flow', future: 'Next Flow', closing: 'Closing' }

export async function runNarrativeReviewCli(args = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== '--fixture' || !/^[1-5]$/.test(args[1])) {
    process.stdout.write(`${usage}\n`)
    return 2
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    process.stderr.write('OPENAI_API_KEY 환경 변수가 필요합니다.\n')
    return 2
  }
  let loader
  try {
    const { createServer } = await import('vite')
    loader = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      configFile: false, envFile: false, logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [{
        name: 'narrative-review-local-runtime',
        resolveId(id) { if (id === 'astro:env/server') return '\0astro:env/server' },
        load(id) { if (id === '\0astro:env/server') return 'export {}' },
      }],
    })
    const { reviewDiagnosticNarrative, formatRejectedChapterReasons } = await loader.ssrLoadModule('/src/lib/saju/narrative/narrative-review.ts')
    const { createOpenAiJsonClient } = await loader.ssrLoadModule('/src/lib/saju/server/openai-json-client.ts')
    const review = await reviewDiagnosticNarrative(Number(args[1]),
      createOpenAiJsonClient(() => process.env.OPENAI_API_KEY))
    for (const chapter of review.chapters) {
      process.stdout.write(`\n--------------------------------\n${chapter.chapter}. ${chapter.title}\n`)
      process.stdout.write(`role: ${labels[chapter.role] ?? chapter.role}\n`)
      process.stdout.write(`coverage: ${chapter.coverageMode}\n`)
      process.stdout.write(`fallback: ${chapter.status === 'fallback' ? 'yes' : 'no'}\n\n`)
      for (const paragraph of chapter.paragraphs) process.stdout.write(`${paragraph}\n\n`)
    }
    process.stdout.write('--------------------------------\n')
    process.stdout.write(`AI 호출 수: ${review.calls}\n`)
    process.stdout.write(`Latency: ${review.latencyMs} ms\n`)
    process.stdout.write(`모델: ${review.model}\n`)
    process.stdout.write(`Input tokens: ${review.usage?.inputTokens ?? 'n/a'}\n`)
    process.stdout.write(`Output tokens: ${review.usage?.outputTokens ?? 'n/a'}\n`)
    process.stdout.write(`Fallback 장: ${review.fallbackChapters.join(', ') || '없음'}\n`)
    process.stdout.write(`검증 거부 장: ${review.rejectedChapters.join(', ') || '없음'}\n`)
    process.stdout.write(`검증 거부 원인: ${formatRejectedChapterReasons(review.rejectedChapterReasons)}\n`)
    const safeDetails = [
      ...(review.httpStatus !== undefined ? [`HTTP ${review.httpStatus}`] : []),
      ...(review.providerError?.type ? [`type=${review.providerError.type}`] : []),
      ...(review.providerError?.code ? [`code=${review.providerError.code}`] : []),
      ...(review.providerError?.param ? [`param=${review.providerError.param}`] : []),
    ]
    process.stdout.write(`전체 실패 원인: ${review.globalFailureReason ?? '없음'}${safeDetails.length ? ` (${safeDetails.join(', ')})` : ''}\n`)
    return 0
  } catch {
    // Never print provider responses, prompts, credentials or private calculation data.
    process.stderr.write('Narrative 검수를 완료하지 못했습니다. fixture와 API 설정을 확인해 주세요.\n')
    return 1
  } finally {
    try { await loader?.close() } catch { /* No diagnostics. */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runNarrativeReviewCli()
}
