import type { BranchCombinationFinding, RootPillar, SajuResult } from '../types'

const COMBINATIONS: readonly (readonly [string, string])[] = [
  ['자', '축'], ['인', '해'], ['묘', '술'], ['진', '유'], ['사', '신'], ['오', '미'],
]

/** 원국 지지의 육합을 위치 쌍별로 기록한다. 합화·강도·거리 효과·해석은 판정하지 않는다. */
export function analyzeBranchCombinations(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'>,
): BranchCombinationFinding[] {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const findings: BranchCombinationFinding[] = []

  for (const [index, firstPillar] of pillars.entries()) {
    const firstBranch = result[firstPillar].branch
    if (firstBranch === null) continue

    for (const secondPillar of pillars.slice(index + 1)) {
      const secondBranch = result[secondPillar].branch
      if (secondBranch === null) continue
      const matches = COMBINATIONS.some(([a, b]) =>
        (firstBranch === a && secondBranch === b) || (firstBranch === b && secondBranch === a),
      )
      if (matches) {
        findings.push({ pillars: [firstPillar, secondPillar], branches: [firstBranch, secondBranch] })
      }
    }
  }

  return findings
}
