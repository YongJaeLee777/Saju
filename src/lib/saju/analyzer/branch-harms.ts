import type { BranchHarmFinding, RootPillar, SajuResult } from '../types'

const HARMS: readonly (readonly [string, string])[] = [
  ['자', '미'], ['축', '오'], ['인', '사'], ['묘', '진'], ['신', '해'], ['유', '술'],
]

/** 원국 지지의 해를 위치 쌍별로 기록한다. 강도·거리 효과·해석은 판정하지 않는다. */
export function analyzeBranchHarms(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'>,
): BranchHarmFinding[] {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const findings: BranchHarmFinding[] = []

  for (const [index, firstPillar] of pillars.entries()) {
    const firstBranch = result[firstPillar].branch
    if (firstBranch === null) continue

    for (const secondPillar of pillars.slice(index + 1)) {
      const secondBranch = result[secondPillar].branch
      if (secondBranch === null) continue
      const matches = HARMS.some(([a, b]) =>
        (firstBranch === a && secondBranch === b) || (firstBranch === b && secondBranch === a),
      )
      if (matches) {
        findings.push({ pillars: [firstPillar, secondPillar], branches: [firstBranch, secondBranch] })
      }
    }
  }

  return findings
}
