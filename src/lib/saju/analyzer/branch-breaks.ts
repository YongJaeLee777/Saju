import type { BranchBreakFinding, RootPillar, SajuResult } from '../types'

const BREAKS: readonly (readonly [string, string])[] = [
  ['자', '유'], ['축', '진'], ['인', '해'], ['묘', '오'], ['사', '신'], ['미', '술'],
]

/** 원국 지지의 파를 위치 쌍별로 기록한다. 강도·거리 효과·해석은 판정하지 않는다. */
export function analyzeBranchBreaks(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'>,
): BranchBreakFinding[] {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const findings: BranchBreakFinding[] = []

  for (const [index, firstPillar] of pillars.entries()) {
    const firstBranch = result[firstPillar].branch
    if (firstBranch === null) continue

    for (const secondPillar of pillars.slice(index + 1)) {
      const secondBranch = result[secondPillar].branch
      if (secondBranch === null) continue
      const matches = BREAKS.some(([a, b]) =>
        (firstBranch === a && secondBranch === b) || (firstBranch === b && secondBranch === a),
      )
      if (matches) {
        findings.push({ pillars: [firstPillar, secondPillar], branches: [firstBranch, secondBranch] })
      }
    }
  }

  return findings
}
