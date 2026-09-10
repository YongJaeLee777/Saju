import type { BranchClashFinding, RootPillar, SajuResult } from '../types'

const CLASHES: readonly (readonly [string, string])[] = [
  ['자', '오'], ['축', '미'], ['인', '신'], ['묘', '유'], ['진', '술'], ['사', '해'],
]

/** 원국 지지의 충을 위치 쌍별로 기록한다. 강도·거리 효과·해석은 판정하지 않는다. */
export function analyzeBranchClashes(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'>,
): BranchClashFinding[] {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const findings: BranchClashFinding[] = []

  for (const [index, firstPillar] of pillars.entries()) {
    const firstBranch = result[firstPillar].branch
    if (firstBranch === null) continue

    for (const secondPillar of pillars.slice(index + 1)) {
      const secondBranch = result[secondPillar].branch
      if (secondBranch === null) continue
      const matches = CLASHES.some(([a, b]) =>
        (firstBranch === a && secondBranch === b) || (firstBranch === b && secondBranch === a),
      )
      if (matches) {
        findings.push({ pillars: [firstPillar, secondPillar], branches: [firstBranch, secondBranch] })
      }
    }
  }

  return findings
}
