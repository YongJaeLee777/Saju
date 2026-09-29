import { fileURLToPath, pathToFileURL } from 'node:url'

const usage = 'Usage: node scripts/headline-review.mjs --fixture <1-5> | --all'

function selection(args) {
  if (args.length === 1 && args[0] === '--all') return [1, 2, 3, 4, 5]
  if (args.length === 2 && args[0] === '--fixture' && /^[1-5]$/.test(args[1])) return [Number(args[1])]
  return null
}

const cell = (value) => String(value).replaceAll('|', '｜').replace(/[\r\n]/g, ' ')
const animalLabels = { rat: '쥐', ox: '소', tiger: '호랑이', rabbit: '토끼', dragon: '용',
  snake: '뱀', horse: '말', sheep: '양', monkey: '원숭이', rooster: '닭', dog: '개', pig: '돼지' }

export async function runHeadlineReviewCli(args = process.argv.slice(2)) {
  const fixtures = selection(args)
  if (!fixtures) {
    process.stdout.write(`${usage}\n`)
    return args.length ? 2 : 0
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
        name: 'headline-review-local-runtime',
        resolveId(id) { if (id === 'astro:env/server') return '\0astro:env/server' },
        load(id) { if (id === '\0astro:env/server') return 'export {}' },
      }],
    })
    const { reviewDiagnosticHeadlines } = await loader.ssrLoadModule('/src/lib/saju/narrative/headline-review.ts')
    const { createOpenAiJsonClient } = await loader.ssrLoadModule('/src/lib/saju/server/openai-json-client.ts')
    const reviews = await reviewDiagnosticHeadlines(fixtures, createOpenAiJsonClient(() => process.env.OPENAI_API_KEY))
    for (const review of reviews) {
      process.stdout.write(`\nFixture ${review.fixture}: ${review.birthDate} ${review.birthTime}\n`)
      process.stdout.write('| 장 / 동물 | 구분 | deterministic title | AI title | 사용 |\n')
      process.stdout.write('|---|---|---|---|---|\n')
      for (const row of review.rows) {
        process.stdout.write(`| ${row.chapter} / ${animalLabels[row.animalKey] ?? cell(row.animalKey)} | ${row.personalization} | ${cell(row.deterministicTitle)} | ${cell(row.aiTitle)} | ${row.status} |\n`)
      }
    }
    const fallback = reviews.flatMap((review) => review.fallbackChapters.map((chapter) => `${review.fixture}:${chapter}`))
    const rejected = reviews.flatMap((review) => review.rejectedChapters.map((chapter) => `${review.fixture}:${chapter}`))
    const reasons = reviews.filter((review) => review.reason).map((review) =>
      `${review.fixture}: ${review.reason}${review.httpStatus ? ` (HTTP ${review.httpStatus})` : ''}`
      + `${review.providerError?.type ? ` type=${review.providerError.type}` : ''}`
      + `${review.providerError?.code ? ` code=${review.providerError.code}` : ''}`
      + `${review.providerError?.param ? ` param=${review.providerError.param}` : ''}`)
    const tokenRows = reviews.map((review) => review.usage).filter(Boolean)
    process.stdout.write(`\nFallback 장: ${fallback.join(', ') || '없음'}\n`)
    process.stdout.write(`검증 거부 장: ${rejected.join(', ') || '없음'}\n`)
    process.stdout.write(`전체 fallback 원인: ${reasons.join(', ') || '없음'}\n`)
    process.stdout.write(`호출 수: ${reviews.reduce((sum, review) => sum + review.calls, 0)}\n`)
    process.stdout.write(`Latency: ${reviews.reduce((sum, review) => sum + review.latencyMs, 0)} ms\n`)
    process.stdout.write(`모델: ${reviews[0]?.model ?? 'n/a'}\n`)
    if (tokenRows.length) process.stdout.write(`Tokens (metadata 있는 ${tokenRows.length}회): input ${tokenRows.reduce((sum, row) => sum + row.inputTokens, 0)}, output ${tokenRows.reduce((sum, row) => sum + row.outputTokens, 0)}\n`)
    return 0
  } catch {
    // Do not print credentials, prompt, response, or provider exceptions.
    process.stderr.write('제목 검수를 완료하지 못했습니다. 입력 선택과 API 설정을 확인해 주세요.\n')
    return 1
  } finally {
    try { await loader?.close() } catch { /* No diagnostics. */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runHeadlineReviewCli()
}
