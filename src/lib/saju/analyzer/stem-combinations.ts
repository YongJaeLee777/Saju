import type { RootPillar, SajuResult, StemCombinationFinding } from '../types'

const COMBINATIONS: readonly (readonly [string, string])[] = [
  ['갑', '기'], ['을', '경'], ['병', '신'], ['정', '임'], ['무', '계'],
]

/** 인접 여부와 무관하게 원국 천간의 합 쌍만 기록한다. 합화 판정은 하지 않는다. */
export function analyzeStemCombinations(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour'>,
): StemCombinationFinding[] {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const findings: StemCombinationFinding[] = []

  for (const [index, firstPillar] of pillars.entries()) {
    const firstStem = result[firstPillar].stem
    if (firstStem === null) continue

    for (const secondPillar of pillars.slice(index + 1)) {
      const secondStem = result[secondPillar].stem
      if (secondStem === null) continue
      const matches = COMBINATIONS.some(([a, b]) =>
        (firstStem === a && secondStem === b) || (firstStem === b && secondStem === a),
      )
      if (matches) {
        findings.push({ pillars: [firstPillar, secondPillar], stems: [firstStem, secondStem] })
      }
    }
  }

  return findings
}
