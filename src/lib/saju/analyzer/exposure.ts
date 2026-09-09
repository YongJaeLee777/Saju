import type { ExposureAnalysis, HiddenStemRole, RootPillar, SajuResult } from '../types'

// Same role convention as the normalized hidden-stem data; no role weighting.
const ROLE_BY_BRANCH_AND_STEM: Record<string, Record<string, HiddenStemRole>> = {
  자: { 계: 'main' }, 축: { 기: 'residual', 계: 'middle', 신: 'main' },
  인: { 갑: 'residual', 병: 'middle', 무: 'main' }, 묘: { 을: 'main' },
  진: { 무: 'residual', 을: 'middle', 계: 'main' }, 사: { 병: 'residual', 경: 'main', 무: 'middle' },
  오: { 정: 'main', 기: 'residual' }, 미: { 기: 'residual', 정: 'middle', 을: 'main' },
  신: { 경: 'residual', 임: 'middle', 무: 'main' }, 유: { 신: 'main' },
  술: { 무: 'residual', 신: 'middle', 정: 'main' }, 해: { 임: 'residual', 갑: 'main' },
}

export function analyzeExposure(
  result: Pick<SajuResult, 'year' | 'month' | 'day' | 'hour' | 'hiddenStems'>,
): ExposureAnalysis {
  const pillars: readonly RootPillar[] = ['year', 'month', 'day', 'hour']
  const exposedStems = pillars
    .filter((pillar) => pillar !== 'hour' || result.hour.stem !== null)
    .map((pillar) => ({ pillar, stem: result[pillar].stem }))
    .filter(({ stem }) => stem !== null)

  const findings = pillars.flatMap((sourcePillar) => {
    const hiddenStems = result.hiddenStems[sourcePillar]
    if (hiddenStems === null) return []
    const sourceBranch = result[sourcePillar].branch
    if (sourceBranch === null) return []

    return hiddenStems.flatMap(({ stem }) => {
      const exposedPillars = exposedStems
        .filter(({ stem: exposedStem }) => exposedStem === stem)
        .map(({ pillar }) => pillar)
      if (exposedPillars.length === 0) return []
      const role = ROLE_BY_BRANCH_AND_STEM[sourceBranch]?.[stem]
      if (!role) throw new Error(`지장간 역할을 찾을 수 없습니다: ${sourceBranch} ${stem}`)
      return [{ sourcePillar, sourceBranch, hiddenStem: stem, role, exposedPillars }]
    })
  })

  return { hasExposure: findings.length > 0, findings }
}
